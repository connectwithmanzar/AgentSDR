import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { isPersonDoNotContact } from "@/lib/crm/policies";
import { outreachCampaigns, outreachLeads } from "@/lib/outreach/schema";
import { isSuppressed } from "@/lib/outreach/suppression";
import { inOrg } from "@/lib/tenancy/scope";
import { recordLeadActivity } from "@/lib/leads/activity";
import { people } from "@/lib/leads/schema";
import { upsertPerson, withLeadTransaction } from "@/lib/leads/records";
import { decideDraftImport, draftMergeFields, type DraftLeadInput } from "./draftLeads";

export type DraftImportResult = {
  id: string | null;
  personId: string | null;
  leadId: string | null;
  status: "created" | "updated" | "rejected";
  reason?: string;
};

/**
 * Stores held per-lead copy. Does not import the scheduler or any send
 * function, and does not change the campaign's status.
 */
export async function importDraftLead(campaignId: string, input: DraftLeadInput, allowActive: boolean): Promise<DraftImportResult> {
  const [campaign] = await withLeadTransaction((tx) =>
    tx.select({ id: outreachCampaigns.id, status: outreachCampaigns.status }).from(outreachCampaigns).where(and(inOrg(outreachCampaigns), eq(outreachCampaigns.id, campaignId))).limit(1),
  );
  const mergeFields = draftMergeFields(input);
  const hasIdentity = Boolean(input.email?.trim() || input.linkedinUrl?.trim());
  let doNotContact = false;
  let suppressed = false;
  if (input.email && await isSuppressed(input.email)) suppressed = true;

  const decisionPreview = decideDraftImport({
    campaignStatus: campaign?.status ?? null,
    allowActive,
    doNotContact: false,
    suppressed,
    existingLead: false,
    hasIdentity,
    mergeFields,
  });
  if (decisionPreview.action === "reject" && decisionPreview.reason !== "Do Not Contact") {
    return { id: null, personId: null, leadId: null, status: "rejected", reason: decisionPreview.reason };
  }

  return withLeadTransaction(async (tx) => {
    const person = await upsertPerson(tx, {
      email: input.email,
      linkedinUrl: input.linkedinUrl,
      firstName: input.firstName,
      lastName: input.lastName,
      fullName: input.fullName,
      title: input.title,
      phone: input.phone,
      company: input.domain ? { name: input.company, domain: input.domain } : null,
      raw: mergeFields,
      source: "api:gtm-draft",
    }, { overwriteCompanyProfile: false });
    const custom = {
      ...((person.custom ?? {}) as Record<string, unknown>),
      ...(input.city ? { x_city: input.city } : {}),
      ...(input.country ? { x_country: input.country } : {}),
      ...(input.emailStatus ? { x_email_status: input.emailStatus } : {}),
    };
    await tx.update(people).set({
      custom,
      raw: { ...(person.raw ?? {}), ...mergeFields },
      updatedAt: new Date(),
    }).where(and(inOrg(people), eq(people.id, person.id)));

    doNotContact = await isPersonDoNotContact(tx, person.id);
    const [existing] = await tx
      .select({ id: outreachLeads.id, customFields: outreachLeads.customFields })
      .from(outreachLeads)
      .where(and(eq(outreachLeads.campaignId, campaignId), eq(outreachLeads.personId, person.id)))
      .limit(1);
    const decision = decideDraftImport({
      campaignStatus: campaign?.status ?? null,
      allowActive,
      doNotContact,
      suppressed: input.email ? await isSuppressed(input.email) : false,
      existingLead: Boolean(existing),
      hasIdentity: true,
      mergeFields,
    });
    if (decision.action === "reject") {
      return { id: person.id, personId: person.id, leadId: existing?.id ?? null, status: "rejected" as const, reason: decision.reason };
    }
    if (existing) {
      await tx.update(outreachLeads).set({
        sequenceStatus: "held",
        customFields: { ...(existing.customFields ?? {}), ...mergeFields },
        updatedAt: new Date(),
      }).where(eq(outreachLeads.id, existing.id));
      return { id: existing.id, personId: person.id, leadId: existing.id, status: "updated" as const };
    }
    const [created] = await tx.insert(outreachLeads).values({
      personId: person.id,
      campaignId,
      sequenceStatus: "held",
      customFields: mergeFields,
    }).returning({ id: outreachLeads.id });
    await recordLeadActivity({
      entity: "person",
      entityId: person.id,
      kind: "enrollment",
      summary: "Held draft added to a campaign",
      actorRef: "GTM Outbound",
    });
    return { id: created.id, personId: person.id, leadId: created.id, status: "created" as const };
  });
}

export async function approveHeldLeads(campaignId: string, leadIds: string[]) {
  return withLeadTransaction(async (tx) => {
    const [campaign] = await tx
      .select({ id: outreachCampaigns.id })
      .from(outreachCampaigns)
      .where(and(inOrg(outreachCampaigns), eq(outreachCampaigns.id, campaignId)))
      .limit(1);
    if (!campaign) return { approved: 0, found: false as const };
    const rows = await tx.update(outreachLeads)
      .set({ sequenceStatus: "pending", updatedAt: new Date() })
      .where(and(
        eq(outreachLeads.campaignId, campaignId),
        eq(outreachLeads.sequenceStatus, "held"),
        leadIds.length ? inArray(outreachLeads.id, leadIds) : undefined,
      ))
      .returning({ id: outreachLeads.id });
    return { approved: rows.length, found: true as const };
  });
}

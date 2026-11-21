import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { clearPersonDoNotContact, setPersonDoNotContact } from "@/lib/crm/policies";
import { crmPersonContactPolicies, crmRecords } from "@/lib/crm/schema";
import { leads as linkedinLeads } from "@/lib/linkedin/schema";
import { outreachCampaigns, outreachLeads } from "@/lib/outreach/schema";
import { inOrg } from "@/lib/tenancy/scope";
import { recordAudit, recordLeadActivity } from "./activity";
import { personDeleteBlock } from "./deskRules";
import { listColumns } from "./columns";
import { companies, people } from "./schema";
import { upsertCompany, withLeadTransaction, type LeadTransaction } from "./records";
import type { LeadColumn } from "./types";

export class LeadRecordError extends Error {
  constructor(message: string, readonly status: 404 | 409 | 400) {
    super(message);
  }
}

function knownCustom(columns: LeadColumn[], input: Record<string, unknown> | undefined) {
  const allowed = new Set(columns.filter((column) => !column.isCore).map((column) => column.key));
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input ?? {})) {
    if (!allowed.has(key)) continue;
    next[key] = value === "" ? null : value;
  }
  return next;
}

function mergeCustom(existing: Record<string, unknown>, patch: Record<string, unknown>) {
  const next = { ...existing };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete next[key];
    else next[key] = value;
  }
  return next;
}

async function personOrThrow(tx: LeadTransaction, id: string) {
  const [row] = await tx.select().from(people).where(and(inOrg(people), eq(people.id, id))).limit(1);
  if (!row) throw new LeadRecordError("Person not found", 404);
  return row;
}

export async function getPersonRecord(id: string) {
  return withLeadTransaction(async (tx) => {
    const person = await personOrThrow(tx, id);
    const [company] = person.companyId
      ? await tx.select().from(companies).where(and(inOrg(companies), eq(companies.id, person.companyId))).limit(1)
      : [];
    const [policy] = await tx.select().from(crmPersonContactPolicies).where(eq(crmPersonContactPolicies.personId, id)).limit(1);
    const [crm] = await tx.select({ id: crmRecords.id }).from(crmRecords).where(and(inOrg(crmRecords), eq(crmRecords.personId, id))).limit(1);
    return { person, company: company ?? null, doNotContact: policy?.doNotContact ?? false, crmRecordId: crm?.id ?? null };
  });
}

export async function patchPersonRecord(
  id: string,
  input: {
    firstName?: string | null;
    lastName?: string | null;
    fullName?: string | null;
    title?: string | null;
    email?: string | null;
    phone?: string | null;
    linkedinUrl?: string | null;
    companyName?: string | null;
    companyDomain?: string | null;
    custom?: Record<string, unknown>;
    note?: string | null;
  },
  actorRef: string,
) {
  const columns = await listColumns("person");
  return withLeadTransaction(async (tx) => {
    const existing = await personOrThrow(tx, id);
    const custom = mergeCustom((existing.custom ?? {}) as Record<string, unknown>, knownCustom(columns, input.custom));
    let companyId = existing.companyId;
    if (input.companyDomain) {
      const company = await upsertCompany(tx, {
        domain: input.companyDomain,
        name: input.companyName,
        source: existing.source,
      }, { overwriteCompanyProfile: false });
      companyId = company?.id ?? companyId;
    }
    const [updated] = await tx.update(people).set({
      firstName: input.firstName === undefined ? existing.firstName : input.firstName,
      lastName: input.lastName === undefined ? existing.lastName : input.lastName,
      fullName: input.fullName === undefined ? existing.fullName : input.fullName,
      title: input.title === undefined ? existing.title : input.title,
      email: input.email === undefined ? existing.email : input.email,
      phone: input.phone === undefined ? existing.phone : input.phone,
      linkedinUrl: input.linkedinUrl === undefined ? existing.linkedinUrl : input.linkedinUrl,
      companyId,
      custom,
      raw: input.note === undefined ? existing.raw : { ...(existing.raw ?? {}), notes: input.note },
      updatedAt: new Date(),
    }).where(and(inOrg(people), eq(people.id, id))).returning();
    await recordLeadActivity({
      entity: "person",
      entityId: id,
      kind: input.note === undefined ? "edit" : "note",
      summary: input.note === undefined ? "Profile updated" : "Note added",
      diff: { custom: input.custom ?? {}, note: input.note ?? null },
      actorRef,
    });
    await recordAudit({ action: "edit", entity: "person", entityId: id, summary: `Updated ${updated.fullName || updated.email || "person"}`, actorRef });
    return updated;
  });
}

const SENDING = new Set(["pending", "held", "initial_sent", "in_follow_up"]);

export async function deletePersonRecord(id: string, removeIdleEnrollments: boolean) {
  return withLeadTransaction(async (tx) => {
    const person = await personOrThrow(tx, id);
    const emailEnrollments = await tx
      .select({ name: outreachCampaigns.name, campaignStatus: outreachCampaigns.status, sequenceStatus: outreachLeads.sequenceStatus, leadId: outreachLeads.id })
      .from(outreachLeads)
      .innerJoin(outreachCampaigns, eq(outreachLeads.campaignId, outreachCampaigns.id))
      .where(and(inOrg(outreachCampaigns), eq(outreachLeads.personId, id)));
    const sending = emailEnrollments.filter((row) => row.campaignStatus === "active" && SENDING.has(row.sequenceStatus));
    const idle = emailEnrollments.filter((row) => !sending.includes(row));
    const [crm] = await tx.select({ id: crmRecords.id }).from(crmRecords).where(and(inOrg(crmRecords), eq(crmRecords.personId, id))).limit(1);
    const blocked = personDeleteBlock({
      sendingCampaigns: sending.map((row) => row.name),
      idleCampaigns: idle.map((row) => row.name),
      hasCrm: Boolean(crm),
      removeIdleEnrollments,
    });
    if (blocked) throw new LeadRecordError(blocked, 409);
    if (emailEnrollments.length) {
      await tx.delete(outreachLeads).where(and(eq(outreachLeads.personId, id), inArray(outreachLeads.id, emailEnrollments.map((row) => row.leadId))));
    }
    await tx.delete(linkedinLeads).where(eq(linkedinLeads.personId, id));
    await tx.delete(crmPersonContactPolicies).where(eq(crmPersonContactPolicies.personId, id));
    await tx.delete(people).where(and(inOrg(people), eq(people.id, id)));
    await recordAudit({
      action: "delete",
      entity: "person",
      entityId: id,
      summary: `Deleted ${person.fullName || person.email || "person"}`,
      actorRef: null,
    });
    return { deleted: true };
  });
}

export async function setPersonDnc(id: string, on: boolean, actorRef: string) {
  await personOrThrowSafe(id);
  const reason = on ? "Marked Do Not Contact from the recruiter desk" : "Cleared Do Not Contact from the recruiter desk";
  const policy = on
    ? await setPersonDoNotContact({ personId: id, reason, source: "human", actorType: "human", actorRef })
    : await clearPersonDoNotContact({ personId: id, reason, source: "human", actorType: "human", actorRef });
  await recordLeadActivity({ entity: "person", entityId: id, kind: "dnc", summary: on ? "Marked Do Not Contact" : "Cleared Do Not Contact", actorRef });
  await recordAudit({ action: "dnc", entity: "person", entityId: id, summary: on ? "Marked Do Not Contact" : "Cleared Do Not Contact", actorRef, diff: { doNotContact: on } });
  return policy;
}

async function personOrThrowSafe(id: string) {
  const [row] = await withLeadTransaction((tx) => tx.select({ id: people.id }).from(people).where(and(inOrg(people), eq(people.id, id))).limit(1));
  if (!row) throw new LeadRecordError("Person not found", 404);
}

export async function getCompanyRecord(id: string) {
  return withLeadTransaction(async (tx) => {
    const [company] = await tx.select().from(companies).where(and(inOrg(companies), eq(companies.id, id))).limit(1);
    if (!company) throw new LeadRecordError("Company not found", 404);
    const peopleRows = await tx.select({ id: people.id }).from(people).where(and(inOrg(people), eq(people.companyId, id)));
    return { company, peopleCount: peopleRows.length };
  });
}

export async function patchCompanyRecord(
  id: string,
  input: { name?: string | null; linkedinUrl?: string | null; custom?: Record<string, unknown>; note?: string | null },
  actorRef: string,
) {
  const columns = await listColumns("company");
  return withLeadTransaction(async (tx) => {
    const [existing] = await tx.select().from(companies).where(and(inOrg(companies), eq(companies.id, id))).limit(1);
    if (!existing) throw new LeadRecordError("Company not found", 404);
    const custom = mergeCustom((existing.custom ?? {}) as Record<string, unknown>, knownCustom(columns, input.custom));
    const [updated] = await tx.update(companies).set({
      name: input.name === undefined ? existing.name : input.name,
      linkedinUrl: input.linkedinUrl === undefined ? existing.linkedinUrl : input.linkedinUrl,
      custom,
      raw: input.note === undefined ? existing.raw : { ...(existing.raw ?? {}), notes: input.note },
      updatedAt: new Date(),
    }).where(and(inOrg(companies), eq(companies.id, id))).returning();
    await recordLeadActivity({
      entity: "company",
      entityId: id,
      kind: input.note === undefined ? "edit" : "note",
      summary: input.note === undefined ? "Account updated" : "Note added",
      actorRef,
      diff: { custom: input.custom ?? {} },
    });
    await recordAudit({ action: "edit", entity: "company", entityId: id, summary: `Updated ${updated.name || updated.domain}`, actorRef });
    return updated;
  });
}

export async function deleteCompanyRecord(id: string) {
  return withLeadTransaction(async (tx) => {
    const [company] = await tx.select().from(companies).where(and(inOrg(companies), eq(companies.id, id))).limit(1);
    if (!company) throw new LeadRecordError("Company not found", 404);
    const linked = await tx.select({ id: people.id }).from(people).where(and(inOrg(people), eq(people.companyId, id))).limit(1);
    if (linked.length) throw new LeadRecordError("This account still has people. Move or delete them first.", 409);
    await tx.delete(companies).where(and(inOrg(companies), eq(companies.id, id)));
    await recordAudit({ action: "delete", entity: "company", entityId: id, summary: `Deleted ${company.name || company.domain}`, actorRef: null });
    return { deleted: true };
  });
}

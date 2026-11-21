/**
 * GTM Outbound pushes per-lead copy. This decides what to store. It never
 * starts a campaign and never sends mail — there is no send branch.
 */

export type DraftCampaignStatus = "draft" | "active" | "paused" | "completed";

export type DraftLeadInput = {
  email?: string | null;
  linkedinUrl?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  title?: string | null;
  company?: string | null;
  domain?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  emailStatus?: string | null;
  steps?: Array<{ subject?: string | null; body?: string | null }>;
};

export type DraftDecision =
  | { action: "reject"; reason: string }
  | { action: "hold"; mode: "create" | "update"; mergeFields: Record<string, string> };

export function draftMergeFields(input: DraftLeadInput): Record<string, string> {
  const fields: Record<string, string> = {};
  const steps = input.steps ?? [];
  steps.forEach((step, index) => {
    const n = index + 1;
    if (step.subject != null) fields[`s${n}_subject`] = step.subject;
    if (step.body != null) fields[`s${n}_body`] = step.body;
  });
  return fields;
}

export function decideDraftImport(input: {
  campaignStatus: string | null;
  allowActive: boolean;
  doNotContact: boolean;
  suppressed: boolean;
  existingLead: boolean;
  hasIdentity: boolean;
  mergeFields: Record<string, string>;
}): DraftDecision {
  if (!input.campaignStatus) return { action: "reject", reason: "Campaign not found" };
  if (input.campaignStatus === "completed") return { action: "reject", reason: "This campaign is finished" };
  if (input.campaignStatus === "active" && !input.allowActive) {
    return { action: "reject", reason: "This campaign is sending. Push drafts to a draft or paused campaign, or pass allowActiveCampaign." };
  }
  if (!input.hasIdentity) return { action: "reject", reason: "An email or LinkedIn URL is required" };
  if (input.doNotContact) return { action: "reject", reason: "Do Not Contact" };
  if (input.suppressed) return { action: "reject", reason: "Suppressed" };
  return { action: "hold", mode: input.existingLead ? "update" : "create", mergeFields: input.mergeFields };
}

export function parseDraftLeadsBody(value: unknown): { leads: DraftLeadInput[]; allowActiveCampaign: boolean } {
  if (!value || typeof value !== "object") throw new Error("JSON object required");
  const body = value as { leads?: unknown; allowActiveCampaign?: unknown };
  if (!Array.isArray(body.leads) || body.leads.length === 0) throw new Error("leads must be a non-empty array");
  if (body.leads.length > 500) throw new Error("At most 500 leads per request");
  const leads = body.leads.map((row, index) => {
    if (!row || typeof row !== "object") throw new Error(`leads[${index}] must be an object`);
    const item = row as Record<string, unknown>;
    const text = (key: string) => (typeof item[key] === "string" ? item[key] : null);
    const steps = Array.isArray(item.steps)
      ? item.steps.map((step) => {
          if (!step || typeof step !== "object") return {};
          const record = step as Record<string, unknown>;
          return {
            subject: typeof record.subject === "string" ? record.subject : null,
            body: typeof record.body === "string" ? record.body : null,
          };
        })
      : [];
    return {
      email: text("email"),
      linkedinUrl: text("linkedinUrl") ?? text("linkedin"),
      firstName: text("firstName"),
      lastName: text("lastName"),
      fullName: text("fullName") ?? text("name"),
      title: text("title"),
      company: text("company") ?? text("companyName"),
      domain: text("domain") ?? text("companyDomain"),
      city: text("city"),
      country: text("country"),
      phone: text("phone"),
      emailStatus: text("emailStatus"),
      steps,
    } satisfies DraftLeadInput;
  });
  return { leads, allowActiveCampaign: body.allowActiveCampaign === true };
}

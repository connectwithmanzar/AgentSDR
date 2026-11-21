import { and, asc, count, desc, eq, exists, ilike, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, people } from "./schema";
import { outreachCampaigns, outreachLeads } from "@/lib/outreach/schema";
import { campaigns as linkedinCampaigns, leads as linkedinLeads } from "@/lib/linkedin/schema";
import { nextCompanyProfile } from "./companyProfile";
import { inferCompanyDomainFromEmail, normalizeCompanyDomain, normalizeEmail, normalizeLinkedinSlug } from "./identity";
import { personProfile } from "./variables";
import { crmProjectionForPeople } from "@/lib/crm/queries";
import { crmClassifications, crmPersonContactPolicies, crmRecords } from "@/lib/crm/schema";
import { suppressionList } from "@/lib/outreach/schema";
import { listColumns } from "./columns";
import type { FieldFilter } from "./filters";
import { companyFilterSql, companySortExpr, personFilterSql, personSortExpr } from "./listFilters";
import { currentOrganizationId, inOrg } from "@/lib/tenancy/scope";

export type LeadTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type LeadExecutor = Pick<LeadTransaction, "select" | "insert" | "update" | "delete" | "execute">;
type PersonSnapshot = Pick<typeof people.$inferSelect,
  "id" | "email" | "linkedinUrl" | "firstName" | "lastName" | "fullName" | "title" | "profilePictureUrl" | "phone" | "companyId" | "raw"
>;
export type LeadMutationContext = {
  companyCache?: Map<string, typeof companies.$inferSelect>;
  personCache?: Map<string, PersonSnapshot>;
  replaceNames?: boolean;
  /** When false (the default), an existing domain keeps its name and profile. */
  overwriteCompanyProfile?: boolean;
};

export type CanonicalPersonInput = {
  email?: string | null;
  linkedinUrl?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  title?: string | null;
  profilePictureUrl?: string | null;
  /** E.164, already normalized by @/lib/calls/phone's normalizePhone(). */
  phone?: string | null;
  company?: {
    domain?: string | null;
    name?: string | null;
    linkedinUrl?: string | null;
    custom?: Record<string, unknown>;
    raw?: Record<string, unknown>;
  } | null;
  custom?: Record<string, unknown>;
  raw?: Record<string, unknown>;
  source: string;
};

function clean(value: string | null | undefined): string | null {
  const result = value?.trim() ?? "";
  return result || null;
}

function splitFullName(value: string | null): { firstName: string | null; lastName: string | null } {
  if (!value) return { firstName: null, lastName: null };
  const [firstName, ...rest] = value.split(/\s+/);
  return { firstName: firstName || null, lastName: rest.join(" ") || null };
}

export function assertCompatiblePersonIdentities(
  existing: { email: string | null; linkedinUrl: string | null },
  incoming: { email: string | null; linkedinUrl: string | null },
) {
  if (existing.email && incoming.email && existing.email.toLowerCase() !== incoming.email) {
    throw new Error("This LinkedIn profile already belongs to a person with a different email address");
  }
  if (existing.linkedinUrl && incoming.linkedinUrl && existing.linkedinUrl !== incoming.linkedinUrl) {
    throw new Error("This email address already belongs to a person with a different LinkedIn profile");
  }
}

export function resolvePersonNames(
  input: Pick<CanonicalPersonInput, "firstName" | "lastName" | "fullName">,
  existing?: { firstName: string | null; lastName: string | null; fullName: string | null } | null,
  options: { replaceExisting?: boolean } = {},
) {
  const explicitFullName = clean(input.fullName);
  const split = splitFullName(explicitFullName);
  const suppliedFirstName = clean(input.firstName) ?? split.firstName;
  const suppliedLastName = clean(input.lastName) ?? split.lastName;
  const firstName = suppliedFirstName ?? (options.replaceExisting ? null : existing?.firstName ?? null);
  const lastName = suppliedLastName ?? (options.replaceExisting ? null : existing?.lastName ?? null);
  const fullName = explicitFullName
    ?? (suppliedFirstName || suppliedLastName
      ? [firstName, lastName].filter(Boolean).join(" ") || null
      : options.replaceExisting
        ? null
        : existing?.fullName ?? ([firstName, lastName].filter(Boolean).join(" ") || null));
  return { firstName, lastName, fullName };
}

/** Unmapped extras only. Known fields are written to typed People/Company columns. */
export function personRawFromInput(input: CanonicalPersonInput): Record<string, unknown> {
  const suppliedRaw = Object.fromEntries(Object.entries(input.raw ?? {}).filter(([key]) => {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    return normalized !== "email" && normalized !== "linkedin" && normalized !== "linkedinurl";
  }));
  return suppliedRaw;
}

export function mergePersonRaw(
  existing: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  return { ...(existing ?? {}), ...incoming };
}

async function lockIdentities(tx: LeadExecutor, identities: string[]) {
  // Identities are unique per organization, so the lock is too: two
  // organizations importing the same email must not queue behind each other.
  const organizationId = currentOrganizationId();
  for (const identity of [...new Set(identities)].sort()) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${organizationId}:${identity}`}, 0))`);
  }
}

export async function upsertCompany(
  tx: LeadExecutor,
  input: NonNullable<CanonicalPersonInput["company"]> & { source: string },
  context?: LeadMutationContext,
) {
  const domain = normalizeCompanyDomain(input.domain);
  if (!domain) return null;

  const values = {
    name: clean(input.name),
    linkedinUrl: clean(input.linkedinUrl),
    raw: input.raw ?? {},
  };
  const overwrite = context?.overwriteCompanyProfile === true;
  const applyExisting = async (current: typeof companies.$inferSelect) => {
    const decision = nextCompanyProfile(
      {
        name: current.name,
        linkedinUrl: current.linkedinUrl,
        custom: (current.custom ?? {}) as Record<string, unknown>,
        raw: (current.raw ?? {}) as Record<string, unknown>,
      },
      { name: values.name, linkedinUrl: values.linkedinUrl, custom: input.custom, raw: values.raw },
      overwrite,
    );
    if (!decision.write) {
      context?.companyCache?.set(domain, current);
      return current;
    }
    const [updated] = await tx
      .update(companies)
      .set({
        name: decision.profile.name,
        linkedinUrl: decision.profile.linkedinUrl,
        custom: decision.profile.custom,
        raw: decision.profile.raw,
        updatedAt: new Date(),
      })
      .where(and(inOrg(companies), eq(companies.id, current.id)))
      .returning();
    context?.companyCache?.set(domain, updated);
    return updated;
  };

  const cached = context?.companyCache?.get(domain);
  if (cached) return applyExisting(cached);

  await lockIdentities(tx, [`company:${domain}`]);
  const [existing] = await tx.select().from(companies).where(and(inOrg(companies), eq(companies.domain, domain))).limit(1);

  if (existing) return applyExisting(existing);

  const [created] = await tx
    .insert(companies)
    .values({ organizationId: currentOrganizationId(), domain, ...values, custom: input.custom ?? {}, source: input.source })
    .returning();
  context?.companyCache?.set(domain, created);
  return created;
}

export async function upsertPerson(tx: LeadExecutor, input: CanonicalPersonInput, context?: LeadMutationContext) {
  const email = normalizeEmail(input.email);
  const linkedinUrl = normalizeLinkedinSlug(input.linkedinUrl);
  if (!email && !linkedinUrl) throw new Error("A person requires an email address or LinkedIn URL");

  await lockIdentities(tx, [email ? `person:email:${email}` : "", linkedinUrl ? `person:linkedin:${linkedinUrl}` : ""].filter(Boolean));

  const matches = await tx
    .select()
    .from(people)
    .where(and(inOrg(people), or(email ? sql`lower(${people.email}) = ${email}` : undefined, linkedinUrl ? eq(people.linkedinUrl, linkedinUrl) : undefined)));

  const ids = new Set(matches.map((row) => row.id));
  if (ids.size > 1) {
    throw new Error("The email address and LinkedIn profile belong to different people; merge them before continuing");
  }

  const company = input.company
    ? await upsertCompany(tx, {
        ...input.company,
        domain: input.company.domain ?? (input.company.name ? inferCompanyDomainFromEmail(email) : null),
        source: input.source,
      }, context)
    : null;
  // Email is the primary identity. LinkedIn is the fallback, while querying
  // both above still lets us detect and reject an unsafe cross-person merge.
  const existing = (email ? matches.find((row) => row.email?.toLowerCase() === email) : undefined)
    ?? (linkedinUrl ? matches.find((row) => row.linkedinUrl === linkedinUrl) : undefined);
  if (existing) assertCompatiblePersonIdentities(existing, { email, linkedinUrl });
  const names = resolvePersonNames(input, existing, { replaceExisting: context?.replaceNames });
  const next = {
    email,
    linkedinUrl,
    ...names,
    title: clean(input.title),
    profilePictureUrl: clean(input.profilePictureUrl),
    phone: clean(input.phone),
    companyId: company?.id ?? null,
    raw: {
      ...personRawFromInput(input),
      ...(!company && input.company?.name ? { company: clean(input.company.name), companyName: clean(input.company.name) } : {}),
      ...(!company && input.company?.domain ? { companyDomain: normalizeCompanyDomain(input.company.domain) } : {}),
    },
  };

  if (existing) {
    const [updated] = await tx
      .update(people)
      .set({
        email: next.email ?? existing.email,
        linkedinUrl: next.linkedinUrl ?? existing.linkedinUrl,
        firstName: next.firstName,
        lastName: next.lastName,
        fullName: next.fullName,
        title: next.title ?? existing.title,
        profilePictureUrl: next.profilePictureUrl ?? existing.profilePictureUrl,
        phone: next.phone ?? existing.phone,
        companyId: next.companyId ?? existing.companyId,
        custom: mergePersonRaw((existing.custom ?? {}) as Record<string, unknown>, input.custom ?? {}),
        raw: mergePersonRaw(existing.raw, next.raw),
        updatedAt: new Date(),
      })
      .where(and(inOrg(people), eq(people.id, existing.id)))
      .returning();
    context?.personCache?.set(updated.id, updated);
    return updated;
  }

  const [created] = await tx.insert(people).values({
    organizationId: currentOrganizationId(),
    ...next,
    custom: input.custom ?? {},
    source: input.source,
  }).returning();
  context?.personCache?.set(created.id, created);
  return created;
}

/** Create the canonical row before a LinkedIn search id has been resolved. */
export async function createProvisionalPerson(tx: LeadExecutor, input: CanonicalPersonInput, context?: LeadMutationContext) {
  const company = input.company
    ? await upsertCompany(tx, { ...input.company, source: input.source }, context)
    : null;
  const names = resolvePersonNames(input);
  const raw = {
    ...personRawFromInput(input),
    ...(!company && input.company?.name ? { company: clean(input.company.name), companyName: clean(input.company.name) } : {}),
    ...(!company && input.company?.domain ? { companyDomain: normalizeCompanyDomain(input.company.domain) } : {}),
  };
  const [created] = await tx.insert(people).values({
    organizationId: currentOrganizationId(),
    email: null,
    linkedinUrl: null,
    ...names,
    title: clean(input.title),
    profilePictureUrl: clean(input.profilePictureUrl),
    phone: clean(input.phone),
    companyId: company?.id ?? null,
    raw,
    source: input.source,
  }).returning();
  context?.personCache?.set(created.id, created);
  return created;
}

/**
 * Enrich an already-created Person while preserving its id whenever the newly
 * discovered canonical identities do not already belong to another Person.
 */
export async function enrichPersonById(tx: LeadExecutor, personId: string, input: CanonicalPersonInput, context?: LeadMutationContext) {
  const cached = context?.personCache?.get(personId);
  const [selected] = cached ? [cached] : await tx.select().from(people).where(and(inOrg(people), eq(people.id, personId))).limit(1);
  const existing = cached ?? selected;
  if (!existing) throw new Error(`Person ${personId} no longer exists`);

  const incomingEmail = normalizeEmail(input.email);
  const incomingLinkedinUrl = normalizeLinkedinSlug(input.linkedinUrl);
  const email = incomingEmail ?? existing.email;
  const linkedinUrl = incomingLinkedinUrl ?? existing.linkedinUrl;
  const identityChanged = Boolean(
    (incomingEmail && incomingEmail !== existing.email)
    || (incomingLinkedinUrl && incomingLinkedinUrl !== existing.linkedinUrl),
  );

  if (identityChanged) {
    await lockIdentities(tx, [email ? `person:email:${email}` : "", linkedinUrl ? `person:linkedin:${linkedinUrl}` : ""].filter(Boolean));
    const otherMatches = await tx.select().from(people).where(and(
      inOrg(people),
      ne(people.id, personId),
      or(
        email ? sql`lower(${people.email}) = ${email}` : undefined,
        linkedinUrl ? eq(people.linkedinUrl, linkedinUrl) : undefined,
      ),
    ));
    const ids = new Set(otherMatches.map((row) => row.id));
    if (ids.size > 1) throw new Error("The discovered email and LinkedIn profile belong to different people; merge them before continuing");
    if (otherMatches[0]) {
      assertCompatiblePersonIdentities(otherMatches[0], { email, linkedinUrl });
      return upsertPerson(tx, { ...input, email, linkedinUrl }, context);
    }
  }

  assertCompatiblePersonIdentities(existing, { email, linkedinUrl });
  const company = input.company
    ? await upsertCompany(tx, {
        ...input.company,
        domain: input.company.domain ?? (input.company.name ? inferCompanyDomainFromEmail(email) : null),
        source: input.source,
      }, context)
    : null;
  const names = resolvePersonNames(input, existing, { replaceExisting: context?.replaceNames });
  const nextRaw = {
    ...personRawFromInput(input),
    ...(!company && input.company?.name ? { company: clean(input.company.name), companyName: clean(input.company.name) } : {}),
    ...(!company && input.company?.domain ? { companyDomain: normalizeCompanyDomain(input.company.domain) } : {}),
  };
  const [updated] = await tx.update(people).set({
    email,
    linkedinUrl,
    ...names,
    title: clean(input.title) ?? existing.title,
    profilePictureUrl: clean(input.profilePictureUrl) ?? existing.profilePictureUrl,
    phone: clean(input.phone) ?? existing.phone,
    companyId: company?.id ?? existing.companyId,
    raw: mergePersonRaw(existing.raw, nextRaw),
    updatedAt: new Date(),
  }).where(and(inOrg(people), eq(people.id, personId))).returning();
  context?.personCache?.set(updated.id, updated);
  return updated;
}

export async function withLeadTransaction<T>(fn: (tx: LeadTransaction) => Promise<T>): Promise<T> {
  return db.transaction(fn);
}

export type CampaignMembership = {
  id: string;
  name: string;
  channel: "email" | "linkedin";
  status: string;
};

type PersonListInput = {
  q?: string;
  limit?: number;
  offset?: number;
  /** Export uses a higher cap than the interactive table. */
  maxLimit?: number;
  campaignChannel?: "email" | "linkedin" | "unassigned";
  hasEmail?: boolean;
  hasLinkedin?: boolean;
  hasPhone?: boolean;
  sort?: string;
  direction?: "asc" | "desc";
  filters?: FieldFilter[];
  crmCategory?: "customer" | "interested" | "not_interested" | "other";
  crmWorkflowState?: "unclassified" | "classifying" | "action_required" | "waiting" | "idle" | "paused" | "closed" | "error";
  crmSubcategoryId?: string;
  crmAiChange?: boolean;
};

function listBounds(input: { limit?: number; offset?: number; maxLimit?: number }) {
  const requestedLimit = Number.isFinite(input.limit) ? Math.floor(input.limit!) : 50;
  const requestedOffset = Number.isFinite(input.offset) ? Math.floor(input.offset!) : 0;
  const cap = Math.min(Math.max(input.maxLimit ?? 200, 1), 10000);
  return { limit: Math.min(Math.max(requestedLimit, 1), cap), offset: Math.max(requestedOffset, 0) };
}

export async function campaignMemberships(personIds: string[]) {
  if (!personIds.length) return new Map<string, CampaignMembership[]>();
  const [emailRows, linkedinRows] = await Promise.all([
    db
      .select({ personId: outreachLeads.personId, id: outreachCampaigns.id, name: outreachCampaigns.name, status: outreachCampaigns.status })
      .from(outreachLeads)
      .innerJoin(outreachCampaigns, eq(outreachLeads.campaignId, outreachCampaigns.id))
      .where(and(inOrg(outreachCampaigns), inArray(outreachLeads.personId, personIds))),
    db
      .select({ personId: linkedinLeads.personId, id: linkedinCampaigns.id, name: linkedinCampaigns.name, status: linkedinCampaigns.status })
      .from(linkedinLeads)
      .innerJoin(linkedinCampaigns, eq(linkedinLeads.campaignId, linkedinCampaigns.id))
      .where(and(inOrg(linkedinCampaigns), inArray(linkedinLeads.personId, personIds))),
  ]);
  const memberships = new Map<string, CampaignMembership[]>();
  for (const row of emailRows) {
    memberships.set(row.personId, [...(memberships.get(row.personId) ?? []), { ...row, channel: "email" }]);
  }
  for (const row of linkedinRows) {
    memberships.set(row.personId, [...(memberships.get(row.personId) ?? []), { ...row, channel: "linkedin" }]);
  }
  return memberships;
}

export async function listPeoplePage(input: PersonListInput = {}) {
  const { limit, offset } = listBounds(input);
  const columns = await listColumns("person");
  const term = input.q?.trim() ? `%${input.q.trim()}%` : null;
  const fieldFilters = (input.filters ?? []).map((filter) => personFilterSql(filter, columns)).filter((item): item is SQL => Boolean(item));
  const conditions = [
    inOrg(people),
    term ? or(ilike(people.email, term), ilike(people.linkedinUrl, term), ilike(people.fullName, term), ilike(people.title, term), ilike(companies.name, term), ilike(companies.domain, term), sql`${people.raw}::text ilike ${term}`, sql`${people.custom}::text ilike ${term}`) : undefined,
    input.hasEmail === true ? sql`${people.email} is not null` : undefined,
    input.hasLinkedin === true ? sql`${people.linkedinUrl} is not null` : undefined,
    input.hasPhone === true ? sql`${people.phone} is not null` : undefined,
    input.campaignChannel === "email" ? exists(db.select({ id: outreachLeads.id }).from(outreachLeads).where(eq(outreachLeads.personId, people.id))) : undefined,
    input.campaignChannel === "linkedin" ? exists(db.select({ id: linkedinLeads.id }).from(linkedinLeads).where(eq(linkedinLeads.personId, people.id))) : undefined,
    input.campaignChannel === "unassigned"
      ? and(
          sql`not exists (select 1 from outreach_leads where person_id = ${people.id})`,
          sql`not exists (select 1 from "Lead" where "personId" = ${people.id})`,
        )
      : undefined,
    input.crmCategory ? exists(db.select({ id: crmRecords.id }).from(crmRecords).where(and(eq(crmRecords.personId, people.id), eq(crmRecords.categoryKey, input.crmCategory)))) : undefined,
    input.crmWorkflowState ? exists(db.select({ id: crmRecords.id }).from(crmRecords).where(and(eq(crmRecords.personId, people.id), eq(crmRecords.workflowState, input.crmWorkflowState)))) : undefined,
    input.crmSubcategoryId ? exists(db.select({ id: crmRecords.id }).from(crmRecords).where(and(eq(crmRecords.personId, people.id), eq(crmRecords.subcategoryId, input.crmSubcategoryId)))) : undefined,
    input.crmAiChange === true ? exists(
      db.select({ id: crmClassifications.id }).from(crmClassifications)
        .innerJoin(crmRecords, eq(crmRecords.id, crmClassifications.crmRecordId))
        .where(and(eq(crmRecords.personId, people.id), sql`${crmClassifications.acknowledgedAt} is null`)),
    ) : undefined,
    ...fieldFilters,
  ].filter(Boolean);
  const where = conditions.length ? and(...conditions) : undefined;
  const sortExpr = personSortExpr(input.sort ?? "updated", columns);
  const order = input.direction === "asc" ? asc(sortExpr) : desc(sortExpr);
  const joined = {
    from: people,
    company: and(eq(people.companyId, companies.id), inOrg(companies)),
    policy: eq(crmPersonContactPolicies.personId, people.id),
    suppression: and(inOrg(suppressionList), sql`lower(${people.email}) = ${suppressionList.email}`),
  };
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        person: people,
        company: companies,
        doNotContact: sql<boolean>`coalesce(${crmPersonContactPolicies.doNotContact}, false)`,
        suppressionReason: suppressionList.reason,
      })
      .from(joined.from)
      .leftJoin(companies, joined.company)
      .leftJoin(crmPersonContactPolicies, joined.policy)
      .leftJoin(suppressionList, joined.suppression)
      .where(where)
      .orderBy(order, asc(people.id))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(people)
      .leftJoin(companies, joined.company)
      .leftJoin(crmPersonContactPolicies, joined.policy)
      .leftJoin(suppressionList, joined.suppression)
      .where(where),
  ]);
  const memberships = await campaignMemberships(rows.map((row) => row.person.id));
  const crm = await crmProjectionForPeople(rows.map((row) => row.person.id));
  return {
    total,
    rows: rows.map(({ person, company, doNotContact, suppressionReason }) => {
    const profile = personProfile(person, company);
    return {
      person: { ...person, fullName: profile.name, firstName: profile.firstName, lastName: profile.lastName, title: profile.headline },
      company,
      campaigns: memberships.get(person.id) ?? [],
      crm: crm.get(person.id) ?? null,
      doNotContact: Boolean(doNotContact),
      suppressionReason: suppressionReason ?? null,
    };
    }),
  };
}

export async function listPeople(input: { q?: string; limit?: number; offset?: number } = {}) {
  return (await listPeoplePage(input)).rows;
}

export async function listCompanies(input: { q?: string; limit?: number; offset?: number; maxLimit?: number; sort?: string; direction?: "asc" | "desc"; filters?: FieldFilter[] } = {}) {
  const { limit, offset } = listBounds(input);
  const columns = await listColumns("company");
  const term = input.q?.trim() ? `%${input.q.trim()}%` : null;
  const fieldFilters = (input.filters ?? []).map((filter) => companyFilterSql(filter, columns)).filter((item): item is SQL => Boolean(item));
  const where = and(
    inOrg(companies),
    term ? or(ilike(companies.name, term), ilike(companies.domain, term), sql`${companies.raw}::text ilike ${term}`, sql`${companies.custom}::text ilike ${term}`) : undefined,
    ...fieldFilters,
  );
  const peopleCount = count(people.id);
  const sortExpr = companySortExpr(input.sort ?? "updated", columns, sql`${peopleCount}`);
  const order = input.direction === "asc" ? asc(sortExpr) : desc(sortExpr);
  const [rows, [{ total }]] = await Promise.all([
    db
    .select({ company: companies, peopleCount: count(people.id) })
    .from(companies)
    .leftJoin(people, and(eq(people.companyId, companies.id), inOrg(people)))
    .where(where)
    .groupBy(companies.id)
    .orderBy(order, asc(companies.id))
    .limit(limit)
    .offset(offset),
    db.select({ total: count() }).from(companies).where(where),
  ]);
  const companyIds = rows.map(({ company }) => company.id);
  const companyPeople = companyIds.length
    ? await db.select({ personId: people.id, companyId: people.companyId }).from(people).where(and(inOrg(people), inArray(people.companyId, companyIds)))
    : [];
  const memberships = await campaignMemberships(companyPeople.map(({ personId }) => personId));
  const campaignsByCompany = new Map<string, CampaignMembership[]>();
  for (const { personId, companyId } of companyPeople) {
    if (!companyId) continue;
    const known = campaignsByCompany.get(companyId) ?? [];
    const incoming = memberships.get(personId) ?? [];
    const unique = new Map(known.map((campaign) => [`${campaign.channel}:${campaign.id}`, campaign]));
    for (const campaign of incoming) unique.set(`${campaign.channel}:${campaign.id}`, campaign);
    campaignsByCompany.set(companyId, [...unique.values()]);
  }
  return {
    total,
    rows: rows.map((row) => ({ ...row, campaigns: campaignsByCompany.get(row.company.id) ?? [] })),
  };
}

export type CompanySuggestion = { id: string; name: string | null; domain: string; people: number };

/**
 * Companies whose name or domain contains `q`, for a type-ahead. Lighter than
 * listCompanies (no raw/custom scan, no campaign memberships): names that
 * start with the term come first, then the companies with the most people.
 */
export async function suggestCompanies(q: string, limit = 8): Promise<CompanySuggestion[]> {
  const trimmed = q.trim();
  if (!trimmed) return [];
  const escaped = trimmed.replace(/[\\%_]/g, (char) => `\\${char}`);
  const peopleCount = count(people.id);
  const rows = await db
    .select({ id: companies.id, name: companies.name, domain: companies.domain, people: peopleCount })
    .from(companies)
    .leftJoin(people, and(eq(people.companyId, companies.id), inOrg(people)))
    .where(and(inOrg(companies), or(ilike(companies.name, `%${escaped}%`), ilike(companies.domain, `%${escaped}%`))))
    .groupBy(companies.id)
    .orderBy(sql`(${companies.name} ilike ${`${escaped}%`}) desc`, desc(peopleCount), asc(companies.name))
    .limit(Math.min(Math.max(Math.floor(limit), 1), 20));
  return rows.map((row) => ({ ...row, people: Number(row.people) }));
}

export async function getPeopleByIds(tx: LeadExecutor, ids: string[]) {
  if (!ids.length) return [];
  return tx
    .select({ person: people, company: companies })
    .from(people)
    .leftJoin(companies, and(eq(people.companyId, companies.id), inOrg(companies)))
    .where(and(inOrg(people), inArray(people.id, ids)));
}

import "server-only";

import { and, count, desc, eq, sql, type AnyColumn } from "drizzle-orm";
import { db } from "@/lib/db";
import { currentOrganizationId, inOrg } from "@/lib/tenancy/scope";
import { companies, people } from "./schema";
import { organizationAuditLog, organizationDeskSettings } from "./deskSchema";
import { mailboxes, outreachEmails, outreachLeads, outreachMailboxQueue } from "@/lib/outreach/schema";
import { leadsInOrg } from "@/lib/outreach/orgScope";

const ZONE = "Asia/Kolkata";

export async function getDeskSettings() {
  const organizationId = currentOrganizationId();
  const [row] = await db.select().from(organizationDeskSettings).where(eq(organizationDeskSettings.organizationId, organizationId)).limit(1);
  if (row) return row;
  const [created] = await db.insert(organizationDeskSettings).values({ organizationId }).onConflictDoNothing().returning();
  if (created) return created;
  const [again] = await db.select().from(organizationDeskSettings).where(eq(organizationDeskSettings.organizationId, organizationId)).limit(1);
  if (!again) throw new Error("Could not read desk settings");
  return again;
}

export async function updateDeskSettings(input: { candidateAtsUrl?: string | null; checklist?: Record<string, boolean>; dismissChecklist?: boolean }) {
  const current = await getDeskSettings();
  const url = input.candidateAtsUrl === undefined
    ? current.candidateAtsUrl
    : input.candidateAtsUrl?.trim() || null;
  if (url && !/^https:\/\//.test(url)) throw new Error("The candidate database URL must start with https://");
  const [updated] = await db.update(organizationDeskSettings).set({
    candidateAtsUrl: url,
    checklist: input.checklist ? { ...current.checklist, ...input.checklist } : current.checklist,
    checklistDismissedAt: input.dismissChecklist ? new Date() : current.checklistDismissedAt,
    updatedAt: new Date(),
  }).where(eq(organizationDeskSettings.organizationId, current.organizationId)).returning();
  return updated;
}

export async function listAudit(q: string | undefined, limit = 50) {
  const term = q?.trim() ? `%${q.trim()}%` : null;
  return db.select().from(organizationAuditLog).where(and(
    inOrg(organizationAuditLog),
    term ? sql`${organizationAuditLog.summary} ilike ${term}` : undefined,
  )).orderBy(desc(organizationAuditLog.createdAt)).limit(Math.min(limit, 200));
}

const istToday = (column: AnyColumn) =>
  sql`(${column} at time zone ${ZONE})::date = (now() at time zone ${ZONE})::date`;

export async function recruiterDay() {
  const [mailbox] = await db.select({
    connected: count(),
    cap: sql<number>`coalesce(sum(${mailboxes.dailySendLimit}), 0)`,
  }).from(mailboxes).where(and(inOrg(mailboxes), eq(mailboxes.status, "connected")));
  const [mail] = await db.select({ sentToday: count() })
    .from(outreachEmails)
    .innerJoin(outreachLeads, eq(outreachEmails.leadId, outreachLeads.id))
    .where(and(leadsInOrg(), eq(outreachEmails.status, "sent"), istToday(outreachEmails.sentAt)));
  const [replies] = await db.select({ replies: count() }).from(outreachLeads)
    .where(and(leadsInOrg(), eq(outreachLeads.sequenceStatus, "reply_received"), istToday(outreachLeads.updatedAt)));
  const [bounced] = await db.select({ bounced: count() }).from(outreachLeads)
    .where(and(leadsInOrg(), eq(outreachLeads.sequenceStatus, "bounced"), istToday(outreachLeads.updatedAt)));
  const [queue] = await db.select({ left: count() }).from(outreachMailboxQueue)
    .innerJoin(mailboxes, eq(outreachMailboxQueue.mailboxId, mailboxes.id))
    .where(inOrg(mailboxes));
  const [accounts] = await db.select({
    mandates: sql<number>`count(*) filter (where ${companies.custom} ->> 'x_account_status' in ('Mandate', 'Active'))`,
    roles: sql<number>`count(*) filter (where coalesce(${companies.custom} ->> 'x_roles_hiring', '') <> '')`,
  }).from(companies).where(inOrg(companies));
  const [interested] = await db.select({ interested: count() }).from(people)
    .where(and(inOrg(people), sql`${people.custom} ->> 'x_email_status' = 'interested'`));
  return {
    timeZone: ZONE,
    mailboxConnected: Number(mailbox?.connected ?? 0) > 0,
    sentToday: Number(mail?.sentToday ?? 0),
    dailyCap: Number(mailbox?.cap ?? 0),
    replies: Number(replies?.replies ?? 0),
    bounced: Number(bounced?.bounced ?? 0),
    queueLeft: Number(queue?.left ?? 0),
    interested: Number(interested?.interested ?? 0),
    openMandates: Number(accounts?.mandates ?? 0),
    rolesHiring: Number(accounts?.roles ?? 0),
  };
}

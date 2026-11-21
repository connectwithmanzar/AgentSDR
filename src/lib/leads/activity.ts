import { desc, eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { currentOrganizationId, inOrg } from "@/lib/tenancy/scope";
import { leadActivityEvents, organizationAuditLog } from "./deskSchema";
import type { LeadEntity } from "./types";

export async function recordLeadActivity(input: {
  entity: LeadEntity;
  entityId: string;
  kind: string;
  summary: string;
  diff?: Record<string, unknown>;
  actorRef?: string | null;
}) {
  await db.insert(leadActivityEvents).values({
    organizationId: currentOrganizationId(),
    entity: input.entity,
    entityId: input.entityId,
    kind: input.kind,
    summary: input.summary,
    diff: input.diff ?? {},
    actorRef: input.actorRef ?? null,
  });
}

export async function listLeadActivity(entity: LeadEntity, entityId: string, limit = 50) {
  return db
    .select()
    .from(leadActivityEvents)
    .where(and(
      inOrg(leadActivityEvents),
      eq(leadActivityEvents.entity, entity),
      eq(leadActivityEvents.entityId, entityId),
    ))
    .orderBy(desc(leadActivityEvents.createdAt))
    .limit(Math.min(Math.max(limit, 1), 200));
}

export async function recordAudit(input: {
  action: string;
  entity: string;
  entityId?: string | null;
  summary: string;
  diff?: Record<string, unknown>;
  actorRef?: string | null;
}) {
  await db.insert(organizationAuditLog).values({
    organizationId: currentOrganizationId(),
    action: input.action,
    entity: input.entity,
    entityId: input.entityId ?? null,
    summary: input.summary,
    diff: input.diff ?? {},
    actorRef: input.actorRef ?? null,
  });
}

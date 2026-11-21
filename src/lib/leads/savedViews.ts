import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { currentOrganizationId, inOrg } from "@/lib/tenancy/scope";
import { leadSavedViews } from "./deskSchema";
import type { FieldFilter } from "./filters";
import type { LeadEntity } from "./types";

export type SavedViewInput = {
  name: string;
  entity: LeadEntity;
  columns: string[];
  filters: FieldFilter[];
  sortKey: string;
  sortDirection: "asc" | "desc";
  isDefault?: boolean;
};

export async function listSavedViews(userId: string, entity: LeadEntity) {
  return db
    .select()
    .from(leadSavedViews)
    .where(and(inOrg(leadSavedViews), eq(leadSavedViews.userId, userId), eq(leadSavedViews.entity, entity)))
    .orderBy(desc(leadSavedViews.isDefault), desc(leadSavedViews.updatedAt));
}

export async function saveLeadView(userId: string, input: SavedViewInput) {
  const name = input.name.trim();
  if (!name) throw new Error("Name the view");
  if (input.isDefault) {
    await db
      .update(leadSavedViews)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(and(inOrg(leadSavedViews), eq(leadSavedViews.userId, userId), eq(leadSavedViews.entity, input.entity)));
  }
  const [existing] = await db
    .select({ id: leadSavedViews.id })
    .from(leadSavedViews)
    .where(and(
      inOrg(leadSavedViews),
      eq(leadSavedViews.userId, userId),
      eq(leadSavedViews.entity, input.entity),
      sql`lower(${leadSavedViews.name}) = ${name.toLowerCase()}`,
    ))
    .limit(1);
  if (existing) {
    const [row] = await db
      .update(leadSavedViews)
      .set({
        columns: input.columns,
        filters: { items: input.filters },
        sortKey: input.sortKey,
        sortDirection: input.sortDirection,
        isDefault: input.isDefault ?? false,
        updatedAt: new Date(),
      })
      .where(and(inOrg(leadSavedViews), eq(leadSavedViews.id, existing.id)))
      .returning();
    return row;
  }
  const [row] = await db
    .insert(leadSavedViews)
    .values({
      organizationId: currentOrganizationId(),
      userId,
      name,
      entity: input.entity,
      columns: input.columns,
      filters: { items: input.filters },
      sortKey: input.sortKey,
      sortDirection: input.sortDirection,
      isDefault: input.isDefault ?? false,
    })
    .returning();
  return row;
}

export async function deleteSavedView(userId: string, id: string) {
  const [row] = await db
    .delete(leadSavedViews)
    .where(and(inOrg(leadSavedViews), eq(leadSavedViews.userId, userId), eq(leadSavedViews.id, id)))
    .returning({ id: leadSavedViews.id });
  return row ?? null;
}

import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations, users } from "@/lib/auth/schema";
import type { LeadEntity } from "./types";

/** A person's saved People or Accounts view. Per user and organization. */
export const leadSavedViews = pgTable(
  "lead_saved_views",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    entity: text("entity").notNull().$type<LeadEntity>(),
    columns: jsonb("columns").$type<string[]>().notNull().default([]),
    filters: jsonb("filters").$type<Record<string, unknown>>().notNull().default({}),
    sortKey: text("sort_key").notNull().default("updated"),
    sortDirection: text("sort_direction").notNull().default("desc"),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("lead_saved_views_organization_idx").on(t.organizationId),
    uniqueIndex("lead_saved_views_org_user_entity_name_uq").on(t.organizationId, t.userId, t.entity, sql`lower(${t.name})`),
    index("lead_saved_views_user_entity_idx").on(t.userId, t.entity),
  ],
);

/** Timeline rows for a person or company, including those with no CRM record. */
export const leadActivityEvents = pgTable(
  "lead_activity_events",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey().defaultRandom(),
    entity: text("entity").notNull().$type<LeadEntity>(),
    entityId: uuid("entity_id").notNull(),
    kind: text("kind").notNull(),
    summary: text("summary").notNull(),
    diff: jsonb("diff").$type<Record<string, unknown>>().notNull().default({}),
    actorRef: text("actor_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("lead_activity_events_organization_idx").on(t.organizationId),
    index("lead_activity_events_entity_idx").on(t.organizationId, t.entity, t.entityId, t.createdAt),
  ],
);

/** Owners and admins can search this from Settings. */
export const organizationAuditLog = pgTable(
  "organization_audit_log",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey().defaultRandom(),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    summary: text("summary").notNull(),
    diff: jsonb("diff").$type<Record<string, unknown>>().notNull().default({}),
    actorRef: text("actor_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("organization_audit_log_organization_idx").on(t.organizationId),
    index("organization_audit_log_created_idx").on(t.organizationId, t.createdAt),
  ],
);

/** Per-organization recruiter desk settings. One row, created on first read. */
export const organizationDeskSettings = pgTable(
  "organization_desk_settings",
  {
    organizationId: uuid("organization_id")
      .primaryKey()
      .references(() => organizations.id, { onDelete: "cascade" }),
    candidateAtsUrl: text("candidate_ats_url"),
    checklistDismissedAt: timestamp("checklist_dismissed_at", { withTimezone: true }),
    checklist: jsonb("checklist").$type<Record<string, boolean>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

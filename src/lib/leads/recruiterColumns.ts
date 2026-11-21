/**
 * Lead columns a Career One Stop recruiter desk expects. Values stay in
 * people.custom / companies.custom. Existing keys (x_email_status and the
 * rest) are never renamed or overwritten; missing keys are inserted.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { currentOrganizationId, inOrg } from "@/lib/tenancy/scope";
import { entityColumns } from "./schema";
import { PG_TYPE_FOR_COLUMN_TYPE, type LeadColumnType, type LeadEntity } from "./types";

export const EMAIL_STATUS_OPTIONS = [
  "not contacted",
  "sent",
  "followed up",
  "replied",
  "bounced",
  "interested",
  "not interested",
] as const;

export const COUNTRY_OPTIONS = ["India", "United Arab Emirates"] as const;

export const ACCOUNT_STATUS_OPTIONS = [
  "New",
  "In conversation",
  "Mandate",
  "Active",
  "On hold",
  "Won",
  "Lost",
] as const;

export const ACCOUNT_STAGE_OPTIONS = [
  "Mandate discussion",
  "Mandate signed",
  "Candidates submitted",
  "Interviewing",
  "Offer",
  "Joined",
] as const;

export const COMPANY_SIZE_OPTIONS = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"] as const;

export const INDUSTRY_OPTIONS = [
  "Recruitment",
  "Staffing",
  "Technology",
  "Manufacturing",
  "Retail",
  "Healthcare",
  "Financial services",
  "Other",
] as const;

export type RecruiterColumnSeed = {
  entity: LeadEntity;
  key: string;
  name: string;
  type: LeadColumnType;
  options?: readonly string[];
};

export const RECRUITER_COLUMN_SEEDS: readonly RecruiterColumnSeed[] = [
  { entity: "person", key: "x_city", name: "City", type: "text" },
  { entity: "person", key: "x_country", name: "Country", type: "select", options: COUNTRY_OPTIONS },
  { entity: "person", key: "x_email_status", name: "Email status", type: "select", options: EMAIL_STATUS_OPTIONS },
  { entity: "company", key: "x_industry", name: "Industry", type: "select", options: INDUSTRY_OPTIONS },
  { entity: "company", key: "x_location", name: "Location", type: "text" },
  { entity: "company", key: "x_company_size", name: "Company size", type: "select", options: COMPANY_SIZE_OPTIONS },
  { entity: "company", key: "x_roles_hiring", name: "Roles hiring", type: "text" },
  { entity: "company", key: "x_job_posting_url", name: "Job posting URL", type: "url" },
  { entity: "company", key: "x_job_posted_on", name: "Job posted on", type: "date" },
  { entity: "company", key: "x_signal", name: "Signal", type: "text" },
  { entity: "company", key: "x_owner", name: "Owner", type: "text" },
  { entity: "company", key: "x_account_status", name: "Account status", type: "select", options: ACCOUNT_STATUS_OPTIONS },
  { entity: "company", key: "x_account_stage", name: "Account stage", type: "select", options: ACCOUNT_STAGE_OPTIONS },
  { entity: "company", key: "x_placement_note", name: "Placement note", type: "text" },
  { entity: "company", key: "x_placement_inr", name: "Placement (INR)", type: "currency" },
];

const ensured = new Set<string>();

function optionConfig(options: readonly string[] | undefined): Record<string, unknown> {
  return options ? { options: [...options] } : {};
}

/** Insert any missing recruiter columns for the organization in scope. Idempotent. */
export async function ensureRecruiterColumns(): Promise<void> {
  const organizationId = currentOrganizationId();
  if (ensured.has(organizationId)) return;

  const existing = await db
    .select({ entity: entityColumns.entity, key: entityColumns.key, position: entityColumns.position, config: entityColumns.config })
    .from(entityColumns)
    .where(inOrg(entityColumns));
  const taken = new Set(existing.map((row) => `${row.entity}:${row.key}`));
  const maxPosition = new Map<LeadEntity, number>();
  for (const row of existing) {
    maxPosition.set(row.entity, Math.max(maxPosition.get(row.entity) ?? 0, row.position));
  }

  const missing = RECRUITER_COLUMN_SEEDS.filter((seed) => !taken.has(`${seed.entity}:${seed.key}`));
  if (missing.length) {
    await db.insert(entityColumns).values(missing.map((seed) => {
      const position = (maxPosition.get(seed.entity) ?? 0) + 1;
      maxPosition.set(seed.entity, position);
      return {
        organizationId,
        entity: seed.entity,
        key: seed.key,
        name: seed.name,
        type: seed.type,
        pgType: PG_TYPE_FOR_COLUMN_TYPE[seed.type],
        config: optionConfig(seed.options),
        isCore: false,
        position,
      };
    })).onConflictDoNothing({
      target: [entityColumns.organizationId, entityColumns.entity, entityColumns.key],
    });
  }

  const status = existing.find((row) => row.entity === "person" && row.key === "x_email_status");
  if (status) {
    const current = Array.isArray(status.config?.options)
      ? status.config.options.filter((option): option is string => typeof option === "string")
      : [];
    const merged = [...current];
    for (const option of EMAIL_STATUS_OPTIONS) {
      if (!merged.some((item) => item.toLowerCase() === option)) merged.push(option);
    }
    if (merged.length !== current.length) {
      await db
        .update(entityColumns)
        .set({
          config: { ...status.config, options: merged },
          updatedAt: new Date(),
        })
        .where(and(
          inOrg(entityColumns),
          eq(entityColumns.entity, "person"),
          eq(entityColumns.key, "x_email_status"),
        ));
    }
  }

  ensured.add(organizationId);
}

/** SQL fragment the migration uses so a re-run cannot duplicate keys. */
export const RECRUITER_COLUMN_INSERT_SQL = RECRUITER_COLUMN_SEEDS.map((seed) => {
  const config = JSON.stringify(optionConfig(seed.options)).replace(/'/g, "''");
  const pgType = PG_TYPE_FOR_COLUMN_TYPE[seed.type];
  return `
INSERT INTO entity_columns (organization_id, entity, key, name, type, pg_type, config, is_core, position)
SELECT o.id, '${seed.entity}', '${seed.key}', '${seed.name.replace(/'/g, "''")}', '${seed.type}', '${pgType}', '${config}'::jsonb, false,
       COALESCE((SELECT max(position) FROM entity_columns c WHERE c.organization_id = o.id AND c.entity = '${seed.entity}'), 0) + 1
FROM organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM entity_columns c
  WHERE c.organization_id = o.id AND c.entity = '${seed.entity}' AND c.key = '${seed.key}'
);`;
}).join("\n");

export const EMAIL_STATUS_OPTION_MERGE_SQL = `
UPDATE entity_columns
SET config = jsonb_set(
      COALESCE(config, '{}'::jsonb),
      '{options}',
      (
        SELECT COALESCE(jsonb_agg(value ORDER BY value), '[]'::jsonb)
        FROM (
          SELECT DISTINCT value
          FROM (
            SELECT jsonb_array_elements_text(COALESCE(config->'options', '[]'::jsonb)) AS value
            UNION
            SELECT unnest(ARRAY[${EMAIL_STATUS_OPTIONS.map((option) => `'${option}'`).join(", ")}])
          ) listed
          WHERE length(btrim(value)) > 0
        ) distinct_values
      ),
      true
    ),
    updated_at = now()
WHERE entity = 'person' AND key = 'x_email_status';
`;

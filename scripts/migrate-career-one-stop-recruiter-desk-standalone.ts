/**
 * Self-contained recruiter-desk migrator for the production image.
 * Same tables, column inserts, and email-status option merge as
 * scripts/migrate-career-one-stop-recruiter-desk.ts. Uses Bun's built-in
 * PostgreSQL client so it can run in the lean image (no drizzle graph).
 *
 * Safe to re-run. Does not drop columns, does not rewrite people.custom or
 * people.raw, and does not send mail.
 */
import { SQL } from "bun";

const PG_TYPE_FOR_COLUMN_TYPE: Record<string, string> = {
  text: "text",
  url: "text",
  email: "text",
  image: "text",
  select: "text",
  number: "numeric",
  currency: "numeric",
  boolean: "boolean",
  date: "timestamptz",
  multiselect: "text[]",
  json: "jsonb",
};

const EMAIL_STATUS_OPTIONS = [
  "not contacted",
  "sent",
  "followed up",
  "replied",
  "bounced",
  "interested",
  "not interested",
] as const;

type RecruiterColumnSeed = {
  entity: "person" | "company";
  key: string;
  name: string;
  type: string;
  options?: readonly string[];
};

const RECRUITER_COLUMN_SEEDS: readonly RecruiterColumnSeed[] = [
  { entity: "person", key: "x_city", name: "City", type: "text" },
  { entity: "person", key: "x_country", name: "Country", type: "select", options: ["India", "United Arab Emirates"] },
  { entity: "person", key: "x_email_status", name: "Email status", type: "select", options: EMAIL_STATUS_OPTIONS },
  { entity: "company", key: "x_industry", name: "Industry", type: "select", options: ["Recruitment", "Staffing", "Technology", "Manufacturing", "Retail", "Healthcare", "Financial services", "Other"] },
  { entity: "company", key: "x_location", name: "Location", type: "text" },
  { entity: "company", key: "x_company_size", name: "Company size", type: "select", options: ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"] },
  { entity: "company", key: "x_roles_hiring", name: "Roles hiring", type: "text" },
  { entity: "company", key: "x_job_posting_url", name: "Job posting URL", type: "url" },
  { entity: "company", key: "x_job_posted_on", name: "Job posted on", type: "date" },
  { entity: "company", key: "x_signal", name: "Signal", type: "text" },
  { entity: "company", key: "x_owner", name: "Owner", type: "text" },
  { entity: "company", key: "x_account_status", name: "Account status", type: "select", options: ["New", "In conversation", "Mandate", "Active", "On hold", "Won", "Lost"] },
  { entity: "company", key: "x_account_stage", name: "Account stage", type: "select", options: ["Mandate discussion", "Mandate signed", "Candidates submitted", "Interviewing", "Offer", "Joined"] },
  { entity: "company", key: "x_placement_note", name: "Placement note", type: "text" },
  { entity: "company", key: "x_placement_inr", name: "Placement (INR)", type: "currency" },
];

function optionConfig(options: readonly string[] | undefined): Record<string, unknown> {
  return options ? { options: [...options] } : {};
}

const RECRUITER_COLUMN_INSERT_SQL = RECRUITER_COLUMN_SEEDS.map((seed) => {
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

const EMAIL_STATUS_OPTION_MERGE_SQL = `
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

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS lead_saved_views (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  entity text NOT NULL,
  columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_key text NOT NULL DEFAULT 'updated',
  sort_direction text NOT NULL DEFAULT 'desc',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_saved_views_organization_idx ON lead_saved_views (organization_id);
CREATE INDEX IF NOT EXISTS lead_saved_views_user_entity_idx ON lead_saved_views (user_id, entity);
CREATE UNIQUE INDEX IF NOT EXISTS lead_saved_views_org_user_entity_name_uq
  ON lead_saved_views (organization_id, user_id, entity, lower(name));

CREATE TABLE IF NOT EXISTS lead_activity_events (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity text NOT NULL,
  entity_id uuid NOT NULL,
  kind text NOT NULL,
  summary text NOT NULL,
  diff jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_ref text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_activity_events_organization_idx ON lead_activity_events (organization_id);
CREATE INDEX IF NOT EXISTS lead_activity_events_entity_idx
  ON lead_activity_events (organization_id, entity, entity_id, created_at);

CREATE TABLE IF NOT EXISTS organization_audit_log (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  summary text NOT NULL,
  diff jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_ref text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS organization_audit_log_organization_idx ON organization_audit_log (organization_id);
CREATE INDEX IF NOT EXISTS organization_audit_log_created_idx ON organization_audit_log (organization_id, created_at);

CREATE TABLE IF NOT EXISTS organization_desk_settings (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  candidate_ats_url text,
  checklist_dismissed_at timestamptz,
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS teams_org_name_uq ON teams (organization_id, lower(name));

${RECRUITER_COLUMN_INSERT_SQL}
${EMAIL_STATUS_OPTION_MERGE_SQL}
`;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = new SQL(url, {
    max: 1,
    tls: process.env.DATABASE_SSL === "disable" ? false : { rejectUnauthorized: false },
  });
  try {
    await sql.unsafe(MIGRATION_SQL).simple();
    console.log("Recruiter desk migration applied. Existing people.custom values were left in place.");
  } finally {
    await sql.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

/**
 * Recruiter desk tables and Lead columns for Career One Stop.
 *
 *   bun run scripts/migrate-career-one-stop-recruiter-desk.ts
 *
 * Safe to re-run. Does not drop columns, does not rewrite people.custom or
 * people.raw, and does not send mail. Apply it on the live database after a
 * backup and before starting the upgraded app container.
 */
import { Client } from "pg";
import { EMAIL_STATUS_OPTION_MERGE_SQL, RECRUITER_COLUMN_INSERT_SQL } from "@/lib/leads/recruiterColumns";

const SQL = `
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
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "disable" ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(SQL);
    console.log("Recruiter desk migration applied. Existing people.custom values were left in place.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

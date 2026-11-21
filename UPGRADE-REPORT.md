# Career One Stop recruiter desk

Upgrade of the self-hosted AgentSDR fork (`connectwithmanzar/AgentSDR`, branch `feat/career-one-stop-recruiter-desk`) from `ghcr.io/kandid-ai/agentsdr:0.3.1`. Nothing here was pushed to `Kandid-ai/AgentSDR`. No mail was sent and no DNS was changed.

## What changed

- People and company columns for city, country, email status, account status, hiring signal, job URL, and an optional placement amount in INR. Existing column keys are left in place. Values stay in `custom` jsonb.
- Saved views, a lead timeline, and an organization audit log. New tables are organization-scoped.
- A company matched by domain keeps its name unless an import explicitly overwrites it.
- People and Accounts grids open a profile even when there is no CRM record. Do Not Contact does not need a CRM record. Enrollment and the public draft API refuse Do Not Contact and suppressed addresses.
- `POST /api/v1/campaigns/:id/draft-leads` stores held copy. It does not start a campaign and does not send. See `docs/gtm-draft-import.md`.
- A campaign cannot be set active with zero leads. Table import waits until the table exists. `{{first_name}}` is not rewritten to `{{name}}`. Save and run uses the current row count, up to 10.
- Invites reject a clearly bad email before Resend. Knowledge delete removes citations, versions, then the document. Teams ignore a second create while the first is in flight. The last team can be deleted. All domains is gone from the nav. The guide is at `/guide`.
- The home analytics page shows the India Standard Time day: sent, replies, interested, bounced, queue left, and open mandates.
- Owners and admins see the audit log and can save a candidate database URL (FreeATS recommended, OpenCATS as the alternative). Candidates are not enrolled in client outreach; there is no candidate module.

## Finance role

Roles stay owner, admin, and member. A fourth finance role would change Better Auth's access statements for every organization, so it was not added. Placement (INR) is not rendered on the person or account profile and is not a sequence variable. Owners and admins are the roles that can read the audit log.

## Verify locally

`bun run typecheck` passed. The new unit tests passed (`companyProfile`, `filters`, `deskRules`, `importMapping`, `draftLeads`, `inviteEmail`, `mergeToken`). `src/lib/leads/gridCampaigns.test.mjs` loads the server graph and needs `DATABASE_URL`; this machine has no `.env.local`, so that file was not executed. The app was not clicked through against a database.

## Upgrade a running 0.3.1 container

1. Back up the Postgres volume (`db-data`) before anything else.
2. Keep `INTEGRATION_CREDENTIALS_KEY`, `APP_URL`, and `BETTER_AUTH_URL` exactly as they are. Do not rotate secrets as part of this upgrade.
3. Build this checkout:

```
docker compose -f docker-compose.yml -f docker-compose.build.yml build
```

The image is `agentsdr:local`.

4. With the database still reachable and the app stopped, run:

```
bun run scripts/migrate-career-one-stop-recruiter-desk.ts
```

The script is safe to re-run. It creates the desk tables and missing Lead columns. It does not rewrite `people.custom` or `people.raw`.

5. Start the new container with the same env file and the same volumes. Point the app service at `agentsdr:local` instead of `ghcr.io/kandid-ai/agentsdr:0.3.1`.

Do not run `drizzle-kit push`. Lead tables stay out of `OWNED_TABLES`.

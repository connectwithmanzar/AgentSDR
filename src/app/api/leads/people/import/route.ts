import { NextRequest, NextResponse } from "next/server";
import { and, inArray } from "drizzle-orm";
import { upsertManualPerson, type ManualPersonInput } from "@/lib/leads/manualImport";
import { parseImportRows, parseImportSheet } from "@/lib/leads/importRows";
import { applyImportMapping, IMPORT_TARGETS, parseImportMapping, suggestImportMapping } from "@/lib/leads/importMapping";
import { previewCompanyMerges } from "@/lib/leads/companyProfile";
import { companies } from "@/lib/leads/schema";
import { normalizeCompanyDomain } from "@/lib/leads/identity";
import { db } from "@/lib/db";
import { inOrg } from "@/lib/tenancy/scope";
import { authContextErrorResponse, withOrgContext } from "@/lib/auth/context";

export const dynamic = "force-dynamic";
const MAX_ROWS = 5000;

// The People import needs an Email or LinkedIn URL to identify a row; the
// Calling contacts import (src/app/api/calling/campaigns/[id]/contacts/import)
// shares parseImportRows but filters on phone instead — see that module.
function parseRows(buffer: ArrayBuffer): ManualPersonInput[] {
  return parseImportRows(buffer).filter((row) => row.email || row.linkedinUrl);
}

export async function POST(req: NextRequest) {
  try {
    return await withOrgContext(req, () => importPeople(req));
  } catch (error) {
    const auth = authContextErrorResponse(error);
    if (auth) return auth;
    throw error;
  }
}

async function mappedRows(buffer: ArrayBuffer, mappingValue: unknown): Promise<{ headers: string[]; rows: ManualPersonInput[]; domains: Array<{ domain: string; name: string | null }> }> {
  const sheet = parseImportSheet(buffer);
  const mapping = parseImportMapping(mappingValue, sheet.headers.length);
  const rows = sheet.rows.map((cells) => {
    const mapped = applyImportMapping(sheet.headers, cells, mapping);
    return {
      email: mapped.email,
      linkedinUrl: mapped.linkedinUrl,
      firstName: mapped.firstName,
      lastName: mapped.lastName,
      fullName: mapped.fullName,
      title: mapped.title,
      phone: mapped.phone,
      notes: mapped.notes,
      companyName: mapped.companyName,
      companyDomain: mapped.companyDomain,
      personCustom: mapped.personCustom,
      companyCustom: mapped.companyCustom,
      raw: mapped.raw,
    } satisfies ManualPersonInput;
  }).filter((row) => row.email || row.linkedinUrl);
  const domains = rows.flatMap((row) => {
    const domain = normalizeCompanyDomain(row.companyDomain);
    return domain ? [{ domain, name: row.companyName ?? null }] : [];
  });
  return { headers: sheet.headers, rows, domains };
}

async function importPeople(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "file is required" }, { status: 400 });
  const preview = form?.get("preview") === "1";
  const overwrite = form?.get("overwriteCompanies") === "1";
  const mappingRaw = form?.get("mapping");
  const buffer = await file.arrayBuffer();

  if (preview || typeof mappingRaw === "string") {
    let parsed: Awaited<ReturnType<typeof mappedRows>>;
    try {
      const mappingValue = typeof mappingRaw === "string" && mappingRaw ? JSON.parse(mappingRaw) : suggestImportMapping(parseImportSheet(buffer).headers);
      parsed = await mappedRows(buffer, mappingValue);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to parse file" }, { status: 400 });
    }
    if (preview) {
      const domains = [...new Set(parsed.domains.map((row) => row.domain))];
      const existing = domains.length
        ? await db.select({ domain: companies.domain, name: companies.name }).from(companies).where(andIn(domains))
        : [];
      return NextResponse.json({
        headers: parsed.headers,
        targets: IMPORT_TARGETS,
        mapping: suggestImportMapping(parsed.headers),
        sample: parsed.rows.slice(0, 3),
        merges: previewCompanyMerges(new Map(existing.map((row) => [row.domain, { name: row.name }])), parsed.domains),
      });
    }
    return writeRows(parsed.rows.map((row) => ({ ...row, overwriteCompany: overwrite })));
  }

  let rows: ManualPersonInput[];
  try {
    rows = parseRows(buffer);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to parse file" }, { status: 400 });
  }
  return writeRows(rows);
}

function andIn(domains: string[]) {
  return and(inOrg(companies), inArray(companies.domain, domains));
}

async function writeRows(rows: ManualPersonInput[]) {
  if (!rows.length) return NextResponse.json({ error: "No rows with an Email or LinkedIn URL were found" }, { status: 400 });
  if (rows.length > MAX_ROWS) return NextResponse.json({ error: `Too many rows (max ${MAX_ROWS})` }, { status: 400 });
  let created = 0;
  let updated = 0;
  const failed: Array<{ row: number; identity: string; error: string }> = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    try {
      const result = await upsertManualPerson(row);
      if (result.created) created += 1;
      else updated += 1;
    } catch (error) {
      failed.push({
        row: index + 2,
        identity: row.email ?? row.linkedinUrl ?? "unknown",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return NextResponse.json({ total: rows.length, created, updated, failed });
}

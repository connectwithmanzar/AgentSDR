/**
 * Company identity is the normalized domain. A later import that happens to
 * share that domain must not rename the company or rewrite its profile
 * unless the person importing explicitly opts into overwrite.
 */

export type CompanyProfileFields = {
  name: string | null;
  linkedinUrl: string | null;
  custom: Record<string, unknown>;
  raw: Record<string, unknown>;
};

export type CompanyProfileIncoming = {
  name?: string | null;
  linkedinUrl?: string | null;
  custom?: Record<string, unknown>;
  raw?: Record<string, unknown>;
};

export type CompanyMergePreview = {
  domain: string;
  action: "create" | "reuse";
  currentName: string | null;
  incomingName: string | null;
  nameWouldChange: boolean;
};

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

export function companyNameWouldChange(
  existingName: string | null,
  incomingName: string | null | undefined,
): boolean {
  const next = clean(incomingName);
  return Boolean(next && existingName && next !== existingName);
}

/**
 * Reuse an existing company. Name, LinkedIn and custom fields stay put
 * unless `overwrite` is true. New raw keys are filled in either way so
 * unmapped merge fields (`s1_body` and the rest) are not dropped.
 */
export function nextCompanyProfile(
  existing: CompanyProfileFields,
  incoming: CompanyProfileIncoming,
  overwrite: boolean,
): { profile: CompanyProfileFields; write: boolean; nameWouldChange: boolean } {
  const incomingName = clean(incoming.name);
  const incomingLinkedin = clean(incoming.linkedinUrl);
  const nameWouldChange = companyNameWouldChange(existing.name, incomingName);

  if (!overwrite) {
    const raw = { ...existing.raw };
    let rawChanged = false;
    for (const [key, value] of Object.entries(incoming.raw ?? {})) {
      if (raw[key] === undefined && value !== undefined) {
        raw[key] = value;
        rawChanged = true;
      }
    }
    return {
      profile: rawChanged ? { ...existing, raw } : existing,
      write: rawChanged,
      nameWouldChange,
    };
  }

  const profile: CompanyProfileFields = {
    name: incomingName ?? existing.name,
    linkedinUrl: incomingLinkedin ?? existing.linkedinUrl,
    custom: { ...existing.custom, ...(incoming.custom ?? {}) },
    raw: { ...existing.raw, ...(incoming.raw ?? {}) },
  };
  const write =
    profile.name !== existing.name
    || profile.linkedinUrl !== existing.linkedinUrl
    || JSON.stringify(profile.custom) !== JSON.stringify(existing.custom)
    || JSON.stringify(profile.raw) !== JSON.stringify(existing.raw);
  return { profile, write, nameWouldChange };
}

export function previewCompanyMerges(
  existingByDomain: ReadonlyMap<string, { name: string | null }>,
  incoming: ReadonlyArray<{ domain: string; name: string | null }>,
): CompanyMergePreview[] {
  const seen = new Set<string>();
  const rows: CompanyMergePreview[] = [];
  for (const row of incoming) {
    const domain = row.domain.trim().toLowerCase();
    if (!domain || seen.has(domain)) continue;
    seen.add(domain);
    const existing = existingByDomain.get(domain);
    const incomingName = clean(row.name);
    rows.push({
      domain,
      action: existing ? "reuse" : "create",
      currentName: existing?.name ?? null,
      incomingName,
      nameWouldChange: existing ? companyNameWouldChange(existing.name, incomingName) : false,
    });
  }
  return rows;
}

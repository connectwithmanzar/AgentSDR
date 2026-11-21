/**
 * Column mapping for the People import. Extra headers are not dropped:
 * a chosen Lead column key is written to people.custom or companies.custom,
 * and anything left unmapped stays in raw so merge fields survive.
 */

export type ImportTarget = { key: string; label: string; owner: "person" | "company" | "identity" };

export const IMPORT_TARGETS: readonly ImportTarget[] = [
  { key: "email", label: "Email", owner: "identity" },
  { key: "linkedin_url", label: "LinkedIn", owner: "identity" },
  { key: "first_name", label: "First name", owner: "person" },
  { key: "last_name", label: "Last name", owner: "person" },
  { key: "full_name", label: "Full name", owner: "person" },
  { key: "title", label: "Title", owner: "person" },
  { key: "phone", label: "Phone", owner: "person" },
  { key: "notes", label: "Notes", owner: "person" },
  { key: "x_city", label: "City", owner: "person" },
  { key: "x_country", label: "Country", owner: "person" },
  { key: "x_email_status", label: "Email status", owner: "person" },
  { key: "company_name", label: "Company name", owner: "company" },
  { key: "domain", label: "Domain", owner: "company" },
  { key: "x_industry", label: "Industry", owner: "company" },
  { key: "x_location", label: "Location", owner: "company" },
  { key: "x_company_size", label: "Company size", owner: "company" },
  { key: "x_roles_hiring", label: "Roles hiring", owner: "company" },
  { key: "x_job_posting_url", label: "Job posting URL", owner: "company" },
  { key: "x_job_posted_on", label: "Job posted on", owner: "company" },
  { key: "x_signal", label: "Signal", owner: "company" },
  { key: "x_owner", label: "Owner", owner: "company" },
  { key: "x_account_status", label: "Account status", owner: "company" },
];

const TARGET_KEYS = new Set(IMPORT_TARGETS.map((target) => target.key));

const HEADER_ALIASES: Record<string, string> = {
  email: "email",
  emailaddress: "email",
  linkedin: "linkedin_url",
  linkedinurl: "linkedin_url",
  firstname: "first_name",
  lastname: "last_name",
  name: "full_name",
  fullname: "full_name",
  title: "title",
  jobtitle: "title",
  phone: "phone",
  phonenumber: "phone",
  mobile: "phone",
  notes: "notes",
  city: "x_city",
  country: "x_country",
  emailstatus: "x_email_status",
  company: "company_name",
  companyname: "company_name",
  domain: "domain",
  website: "domain",
  industry: "x_industry",
  location: "x_location",
  companysize: "x_company_size",
  roleshiring: "x_roles_hiring",
  jobpostingurl: "x_job_posting_url",
  accountstatus: "x_account_status",
};

export function normalizeImportHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function suggestImportMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const used = new Set<string>();
  headers.forEach((header, index) => {
    const alias = HEADER_ALIASES[normalizeImportHeader(header)];
    if (!alias || used.has(alias)) return;
    used.add(alias);
    mapping[String(index)] = alias;
  });
  return mapping;
}

export function parseImportMapping(value: unknown, headerCount: number): Record<number, string> {
  if (!value || typeof value !== "object") return {};
  const mapping: Record<number, string> = {};
  for (const [index, key] of Object.entries(value as Record<string, unknown>)) {
    const position = Number(index);
    if (!Number.isInteger(position) || position < 0 || position >= headerCount) continue;
    if (typeof key !== "string" || !TARGET_KEYS.has(key)) continue;
    mapping[position] = key;
  }
  return mapping;
}

function camelKey(header: string): string {
  const words = header.trim().replace(/[^A-Za-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  return words.map((word, index) => (index === 0 ? word.toLowerCase() : word[0].toUpperCase() + word.slice(1).toLowerCase())).join("");
}

export type MappedImportRow = {
  email: string | null;
  linkedinUrl: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  title: string | null;
  phone: string | null;
  notes: string | null;
  companyName: string | null;
  companyDomain: string | null;
  personCustom: Record<string, string>;
  companyCustom: Record<string, string>;
  raw: Record<string, string>;
};

export function applyImportMapping(headers: string[], cells: string[], mapping: Record<number, string>): MappedImportRow {
  const row: MappedImportRow = {
    email: null,
    linkedinUrl: null,
    firstName: null,
    lastName: null,
    fullName: null,
    title: null,
    phone: null,
    notes: null,
    companyName: null,
    companyDomain: null,
    personCustom: {},
    companyCustom: {},
    raw: {},
  };
  headers.forEach((header, index) => {
    const value = cells[index]?.trim() ?? "";
    if (!value) return;
    const key = mapping[index];
    if (!key) {
      const rawKey = camelKey(header);
      if (rawKey) row.raw[rawKey] = value;
      return;
    }
    const target = IMPORT_TARGETS.find((item) => item.key === key);
    if (!target) return;
    if (key === "email") row.email = value;
    else if (key === "linkedin_url") row.linkedinUrl = value;
    else if (key === "first_name") row.firstName = value;
    else if (key === "last_name") row.lastName = value;
    else if (key === "full_name") row.fullName = value;
    else if (key === "title") row.title = value;
    else if (key === "phone") row.phone = value;
    else if (key === "notes") row.notes = value;
    else if (key === "company_name") row.companyName = value;
    else if (key === "domain") row.companyDomain = value;
    else if (target.owner === "company") row.companyCustom[key] = value;
    else row.personCustom[key] = value;
  });
  return row;
}

export type Campaign = { id: string; name: string; channel: "email" | "linkedin"; status?: string };

export type PersonRow = {
  person: {
    id: string;
    email: string | null;
    linkedinUrl: string | null;
    fullName: string | null;
    firstName?: string | null;
    lastName?: string | null;
    title: string | null;
    profilePictureUrl?: string | null;
    phone?: string | null;
    source: string;
    custom?: Record<string, unknown>;
    raw?: Record<string, unknown>;
    updatedAt: string | Date | null;
  };
  company: { id?: string; name: string | null; domain: string; custom?: Record<string, unknown> } | null;
  campaigns: Campaign[];
  crm: { recordId: string; categoryKey: string | null; subcategory: string | null; workflowState: string; activeChannel: string | null; activeSequence: string | null; currentStep: string | null; lastInboundAt: string | Date | null; lastOutboundAt: string | Date | null; lastInteractionAt: string | Date | null; nextActionAt: string | Date | null; unacknowledgedAiChange: boolean } | null;
  doNotContact?: boolean;
  suppressionReason?: string | null;
};

export const PEOPLE_COLUMNS = [
  { key: "first_name", label: "First name" },
  { key: "last_name", label: "Last name" },
  { key: "title", label: "Title" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "email", label: "Email" },
  { key: "x_email_status", label: "Email status" },
  { key: "phone", label: "Phone" },
  { key: "x_city", label: "City" },
  { key: "x_country", label: "Country" },
  { key: "company", label: "Company" },
  { key: "source", label: "Source" },
  { key: "stage", label: "Stage" },
  { key: "do_not_contact", label: "DNC" },
] as const;

export const DEFAULT_PEOPLE_COLUMN_KEYS = PEOPLE_COLUMNS.map((column) => column.key);

export type CompanyRow = {
  company: { id: string; name: string | null; domain: string; linkedinUrl: string | null; source: string; custom?: Record<string, unknown>; updatedAt: string | Date };
  peopleCount: number;
  campaigns: Campaign[];
};

export const COMPANY_COLUMNS = [
  { key: "name", label: "Account" },
  { key: "domain", label: "Domain" },
  { key: "x_industry", label: "Industry" },
  { key: "x_location", label: "Location" },
  { key: "x_company_size", label: "Size" },
  { key: "x_roles_hiring", label: "Roles hiring" },
  { key: "x_account_status", label: "Account status" },
  { key: "x_owner", label: "Owner" },
  { key: "x_signal", label: "Signal" },
  { key: "people", label: "People" },
] as const;

export type LeadsTab = "people" | "companies";
export type Direction = "asc" | "desc";

export type PeopleFilters = {
  campaignChannel: string;
  hasEmail: boolean;
  hasLinkedin: boolean;
  crmCategory: string;
  crmSubcategoryId: string;
  crmWorkflowState: string;
  crmAiChange: boolean;
  emailStatus: string;
  city: string;
  country: string;
  dnc: "" | "true" | "false";
};

export const EMPTY_FILTERS: PeopleFilters = {
  campaignChannel: "",
  hasEmail: false,
  hasLinkedin: false,
  crmCategory: "",
  crmSubcategoryId: "",
  crmWorkflowState: "",
  crmAiChange: false,
  emailStatus: "",
  city: "",
  country: "",
  dnc: "",
};

export function activeFilterCount(filters: PeopleFilters): number {
  return [filters.campaignChannel, filters.hasEmail, filters.hasLinkedin, filters.crmCategory, filters.crmSubcategoryId, filters.crmWorkflowState, filters.crmAiChange, filters.emailStatus, filters.city, filters.country, filters.dnc].filter(Boolean).length;
}

export function peopleFieldFilters(filters: PeopleFilters): string[] {
  const items: string[] = [];
  if (filters.emailStatus) items.push(`x_email_status|eq|${filters.emailStatus}`);
  if (filters.city) items.push(`x_city|contains|${filters.city}`);
  if (filters.country) items.push(`x_country|eq|${filters.country}`);
  if (filters.dnc) items.push(`do_not_contact|${filters.dnc}`);
  return items;
}

export const PAGE_SIZE = 25;

export const linkedInPersonHref = (value: string) => (value.startsWith("http") ? value : `https://www.linkedin.com/in/${value}`);
export const linkedInCompanyHref = (value: string) => (value.startsWith("http") ? value : `https://www.linkedin.com/company/${value}`);
export const initials = (value: string | null) => (value || "?").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
export const dateLabel = (value: string | Date | null | undefined) => (value
  ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value))
  : "—");

/** "Oct 3" this year, "Oct 3, 2025" otherwise — for dates inside a table cell. */
export const shortDate = (value: string | Date | null | undefined) => {
  if (!value) return "—";
  const date = new Date(value);
  const sameYear = date.getUTCFullYear() === new Date().getUTCFullYear();
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" }).format(date);
};

/** Whether a timestamp is still ahead of now. */
export const isFuture = (value: string | Date) => new Date(value).getTime() > Date.now();

/** Sort choices per tab, for the toolbar's sort menu (keys match the API). */
export const SORTS: Record<LeadsTab, Array<{ key: string; label: string }>> = {
  people: [
    { key: "updated", label: "Last updated" },
    { key: "created", label: "Date added" },
    { key: "name", label: "Name" },
    { key: "company", label: "Company" },
    { key: "title", label: "Title" },
    { key: "email", label: "Email" },
    { key: "x_email_status", label: "Email status" },
    { key: "x_city", label: "City" },
    { key: "phone", label: "Phone" },
    { key: "source", label: "Source" },
  ],
  companies: [
    { key: "updated", label: "Last updated" },
    { key: "name", label: "Name" },
    { key: "domain", label: "Domain" },
    { key: "people", label: "People" },
  ],
};

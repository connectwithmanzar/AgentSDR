/**
 * People and Accounts list filters. Custom keys are allowlisted by the
 * caller against entity_columns before they reach SQL.
 */

export type FieldOp = "eq" | "contains" | "empty" | "not_empty" | "true" | "false";

export type FieldFilter = {
  key: string;
  op: FieldOp;
  value?: string;
};

const OPS = new Set<FieldOp>(["eq", "contains", "empty", "not_empty", "true", "false"]);

export const PERSON_CORE_SORTS = [
  "name",
  "first_name",
  "last_name",
  "title",
  "email",
  "phone",
  "linkedin",
  "company",
  "source",
  "updated",
  "created",
] as const;

export const COMPANY_CORE_SORTS = ["name", "domain", "people", "updated", "created"] as const;

export type PersonCoreSort = (typeof PERSON_CORE_SORTS)[number];
export type CompanyCoreSort = (typeof COMPANY_CORE_SORTS)[number];

export function isPersonCoreSort(value: string): value is PersonCoreSort {
  return (PERSON_CORE_SORTS as readonly string[]).includes(value);
}

export function isCompanyCoreSort(value: string): value is CompanyCoreSort {
  return (COMPANY_CORE_SORTS as readonly string[]).includes(value);
}

/** `key|op|value` repeated. Value may contain extra pipes. */
export function parseFieldFilters(raw: string | string[] | null | undefined): FieldFilter[] {
  const parts = raw == null ? [] : Array.isArray(raw) ? raw : [raw];
  const filters: FieldFilter[] = [];
  for (const part of parts) {
    const [key, op, ...rest] = part.split("|");
    if (!key || !OPS.has(op as FieldOp)) continue;
    if (!/^[a-z][a-z0-9_]*$/.test(key)) continue;
    const value = rest.join("|").trim();
    filters.push({ key, op: op as FieldOp, ...(value ? { value } : {}) });
  }
  return filters;
}

export function filterTouchesCustom(filter: FieldFilter): boolean {
  return filter.key.startsWith("x_");
}

/** Round-trip a saved view so reload keeps columns, filters and sort. */
export function savedViewPayload(input: {
  name: string;
  entity: "person" | "company";
  columns: string[];
  filters: FieldFilter[];
  sortKey: string;
  sortDirection: "asc" | "desc";
}) {
  return {
    name: input.name.trim(),
    entity: input.entity,
    columns: [...input.columns],
    filters: input.filters.map((filter) => ({ ...filter })),
    sortKey: input.sortKey,
    sortDirection: input.sortDirection,
  };
}

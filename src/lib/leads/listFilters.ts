import { sql, type AnyColumn, type SQL } from "drizzle-orm";
import { customFieldSql } from "./columns";
import type { FieldFilter } from "./filters";
import { companies, people } from "./schema";
import type { LeadColumn } from "./types";

function customCondition(column: LeadColumn, customColumn: AnyColumn, filter: FieldFilter): SQL | undefined {
  if (column.isCore) return undefined;
  const expr = customFieldSql(customColumn, column);
  switch (filter.op) {
    case "eq":
      return sql`${expr}::text = ${filter.value ?? ""}`;
    case "contains":
      return sql`${expr}::text ilike ${`%${filter.value ?? ""}%`}`;
    case "empty":
      return sql`(${expr}) is null`;
    case "not_empty":
      return sql`(${expr}) is not null`;
    case "true":
      return sql`${expr} is true`;
    case "false":
      return sql`(${expr} is false or ${expr} is null)`;
    default: {
      const neverOp: never = filter.op;
      return neverOp;
    }
  }
}

const PERSON_TEXT: Record<string, SQL> = {
  email: sql`${people.email}`,
  first_name: sql`${people.firstName}`,
  last_name: sql`${people.lastName}`,
  title: sql`${people.title}`,
  phone: sql`${people.phone}`,
  linkedin_url: sql`${people.linkedinUrl}`,
  source: sql`${people.source}`,
  full_name: sql`${people.fullName}`,
};

export function personFilterSql(filter: FieldFilter, columns: LeadColumn[]): SQL | undefined {
  if (filter.key === "do_not_contact") {
    const exists = sql`exists (select 1 from crm_person_contact_policies p where p.person_id = ${people.id} and p.do_not_contact is true)`;
    if (filter.op === "true") return exists;
    if (filter.op === "false") return sql`not ${exists}`;
    return undefined;
  }
  if (filter.key === "suppressed") {
    const exists = sql`exists (select 1 from outreach_suppression_list s where s.organization_id = ${people.organizationId} and lower(${people.email}) = s.email)`;
    if (filter.op === "true") return exists;
    if (filter.op === "false") return sql`not ${exists}`;
    return undefined;
  }
  const core = PERSON_TEXT[filter.key];
  if (core) {
    if (filter.op === "empty") return sql`${core} is null`;
    if (filter.op === "not_empty") return sql`${core} is not null`;
    if (filter.op === "eq") return sql`lower(${core}) = ${filter.value?.toLowerCase() ?? ""}`;
    if (filter.op === "contains") return sql`${core} ilike ${`%${filter.value ?? ""}%`}`;
    return undefined;
  }
  const column = columns.find((item) => item.key === filter.key && item.entity === "person");
  return column ? customCondition(column, people.custom, filter) : undefined;
}

export function companyFilterSql(filter: FieldFilter, columns: LeadColumn[]): SQL | undefined {
  if (filter.key === "name" || filter.key === "domain") {
    const expr = filter.key === "name" ? sql`${companies.name}` : sql`${companies.domain}`;
    if (filter.op === "empty") return sql`${expr} is null`;
    if (filter.op === "not_empty") return sql`${expr} is not null`;
    if (filter.op === "eq") return sql`lower(${expr}) = ${filter.value?.toLowerCase() ?? ""}`;
    if (filter.op === "contains") return sql`${expr} ilike ${`%${filter.value ?? ""}%`}`;
    return undefined;
  }
  const column = columns.find((item) => item.key === filter.key && item.entity === "company");
  return column ? customCondition(column, companies.custom, filter) : undefined;
}

export function personSortExpr(sort: string, columns: LeadColumn[]): SQL {
  const core: Record<string, SQL> = {
    name: sql`${people.fullName}`,
    first_name: sql`${people.firstName}`,
    last_name: sql`${people.lastName}`,
    title: sql`${people.title}`,
    email: sql`${people.email}`,
    phone: sql`${people.phone}`,
    linkedin: sql`${people.linkedinUrl}`,
    company: sql`${companies.name}`,
    source: sql`${people.source}`,
    created: sql`${people.createdAt}`,
    updated: sql`${people.updatedAt}`,
  };
  if (core[sort]) return core[sort];
  const column = columns.find((item) => item.key === sort && !item.isCore && item.entity === "person");
  return column ? customFieldSql(people.custom, column) : sql`${people.updatedAt}`;
}

export function companySortExpr(sort: string, columns: LeadColumn[], peopleCount: SQL): SQL {
  const core: Record<string, SQL> = {
    name: sql`${companies.name}`,
    domain: sql`${companies.domain}`,
    people: peopleCount,
    updated: sql`${companies.updatedAt}`,
    created: sql`${companies.createdAt}`,
  };
  if (core[sort]) return core[sort];
  const column = columns.find((item) => item.key === sort && !item.isCore && item.entity === "company");
  return column ? customFieldSql(companies.custom, column) : sql`${companies.updatedAt}`;
}

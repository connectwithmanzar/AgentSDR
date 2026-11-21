import "server-only";

import { getIntegrationAction } from "@/lib/integrations/catalog";
import { getIntegrationActionHandler } from "@/lib/integrations/server/registry";
import type { EnrichmentConfig } from "@/lib/grid/types";
import { getIntegrationCredentials, listIntegrationConnections } from "@/lib/grid/providers";
import { upsertPerson, withLeadTransaction } from "./records";

export type FoundPerson = {
  email: string | null;
  linkedinUrl: string | null;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  fullName: string | null;
};

async function connection(key: "apollo" | "hunter") {
  const rows = await listIntegrationConnections(key);
  return rows.find((row) => row.enabled && row.verified) ?? null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function findPeopleProviders() {
  const [apollo, hunter] = await Promise.all([connection("apollo"), connection("hunter")]);
  return { apollo: Boolean(apollo), hunter: Boolean(hunter) };
}

export async function findPeopleAtCompany(input: { domain: string; jobTitle: string; provider: "apollo" | "hunter" }): Promise<FoundPerson[]> {
  const linked = await connection(input.provider);
  if (!linked) {
    throw new Error(input.provider === "apollo"
      ? "Connect Apollo under Tables → Integrations, then try Find people again."
      : "Connect Hunter under Tables → Integrations, then try Find people again.");
  }
  const credentials = await getIntegrationCredentials(linked.id);
  if (!credentials) throw new Error("Reconnect the integration before searching.");
  const handlerKey = input.provider === "apollo" ? "apollo.findPeopleAtCompanyByJobTitle" : "hunter.findEmailsByCompany";
  const actionKey = input.provider === "apollo" ? "find-people-at-company-by-job-title" : "find-emails-by-company";
  const action = getIntegrationAction(input.provider, actionKey);
  const handler = getIntegrationActionHandler(handlerKey);
  if (!action || !handler) throw new Error("That search is not available.");
  const config: EnrichmentConfig = {
    integrationKey: input.provider,
    actionKey,
    handlerKey,
    inputs: {},
    outputs: input.provider === "apollo" ? { people: "people" } : { emails: "emails" },
    connectionId: linked.id,
  };
  const result = await handler({
    config,
    action,
    inputs: input.provider === "apollo"
      ? { companyDomain: input.domain, jobTitle: input.jobTitle }
      : { companyDomain: input.domain },
    credentials,
    connectionId: linked.id,
    timeoutMs: 20_000,
  });
  if ("pending" in result) throw new Error("The search is still running. Try again in a moment.");
  const outputs = result.outputs ?? {};
  if (input.provider === "apollo") {
    const people = Array.isArray(outputs.people) ? outputs.people : [];
    return people.map((row: unknown) => {
      const person = asRecord(row);
      return {
        email: text(person.email),
        linkedinUrl: text(person.linkedin_url),
        firstName: text(person.first_name),
        lastName: text(person.last_name),
        title: text(person.title),
        fullName: text(person.name),
      };
    }).filter((person: FoundPerson) => person.email || person.linkedinUrl);
  }
  const emails = Array.isArray(outputs.emails) ? outputs.emails : [];
  return emails.map((row: unknown) => {
    const email = asRecord(row);
    return {
      email: text(email.value),
      linkedinUrl: text(email.linkedin),
      firstName: text(email.first_name),
      lastName: text(email.last_name),
      title: text(email.position),
      fullName: [text(email.first_name), text(email.last_name)].filter(Boolean).join(" ") || null,
    };
  }).filter((person: FoundPerson) => person.email || person.linkedinUrl);
}

export async function saveFoundPeople(input: { domain: string; companyName: string | null; people: FoundPerson[] }) {
  const ids: string[] = [];
  await withLeadTransaction(async (tx) => {
    for (const person of input.people) {
      const saved = await upsertPerson(tx, {
        email: person.email,
        linkedinUrl: person.linkedinUrl,
        firstName: person.firstName,
        lastName: person.lastName,
        fullName: person.fullName,
        title: person.title,
        company: { domain: input.domain, name: input.companyName },
        source: "account-find-people",
      }, { overwriteCompanyProfile: false });
      ids.push(saved.id);
    }
  });
  return ids;
}

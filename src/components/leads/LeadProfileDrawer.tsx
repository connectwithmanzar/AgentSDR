"use client";

import { useEffect, useState } from "react";
import * as Button from "@/components/alignui/button";
import { whatsAppHref } from "@/lib/leads/deskRules";

type Activity = { id: string; kind: string; summary: string; createdAt: string; actorRef: string | null };

type PersonProfile = {
  person: {
    id: string;
    email: string | null;
    linkedinUrl: string | null;
    fullName: string | null;
    firstName: string | null;
    lastName: string | null;
    title: string | null;
    phone: string | null;
    source: string;
    notes: string | null;
    custom: Record<string, unknown>;
  };
  company: { id: string; name: string | null; domain: string; custom?: Record<string, unknown> } | null;
  doNotContact: boolean;
  doNotContactReason: string | null;
  suppressionReason: string | null;
};

type CompanyProfile = {
  company: {
    id: string;
    name: string | null;
    domain: string;
    linkedinUrl: string | null;
    custom: Record<string, unknown>;
  };
  peopleCount: number;
};

export function LeadProfileDrawer({
  personId,
  companyId,
  onClose,
  onChanged,
}: {
  personId: string | null;
  companyId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const open = Boolean(personId || companyId);
  const [person, setPerson] = useState<PersonProfile | null>(null);
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const url = personId ? `/api/leads/people/${personId}` : `/api/leads/companies/${companyId}`;
    void fetch(url)
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? "Could not open this profile");
        if (cancelled) return;
        if (personId) {
          setPerson(body as PersonProfile);
          setCompany(null);
          const profile = body as PersonProfile & { person: { raw?: Record<string, unknown> } };
          setNote(typeof profile.person.raw?.notes === "string" ? profile.person.raw.notes : "");
        } else {
          setCompany(body as CompanyProfile);
          setPerson(null);
        }
        setActivity(Array.isArray(body.activity) ? body.activity : []);
        setError("");
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not open this profile");
      });
    return () => {
      cancelled = true;
    };
  }, [open, personId, companyId]);

  if (!open) return null;

  const savePerson = async (patch: Record<string, unknown>) => {
    if (!personId) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/leads/people/${personId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not save");
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const target = personId ? "person" : "account";
    if (!window.confirm(`Delete this ${target}? This cannot be undone from the app.`)) return;
    const url = personId
      ? `/api/leads/people/${personId}?removeFromCampaigns=1`
      : `/api/leads/companies/${companyId}`;
    setBusy(true);
    const response = await fetch(url, { method: "DELETE" });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(body.error ?? "Could not delete");
      return;
    }
    onChanged();
    onClose();
  };

  const wa = person?.person.phone ? whatsAppHref(person.person.phone) : null;
  const title = person?.person.fullName || company?.company.name || company?.company.domain || "Profile";

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" role="presentation" onClick={onClose}>
      <aside
        role="dialog"
        aria-label={title}
        className="flex h-full w-full max-w-xl flex-col overflow-y-auto bg-bg-white-0 p-5 shadow-regular-md sm:max-w-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-label-lg text-text-strong-950">{title}</h2>
            <p className="mt-1 text-paragraph-sm text-text-sub-600">
              {person ? person.person.title || person.person.email || "Person" : `${company?.peopleCount ?? 0} people`}
            </p>
          </div>
          <Button.Root variant="neutral" mode="ghost" size="small" onClick={onClose}>Close</Button.Root>
        </div>
        {error && <p role="alert" className="mt-4 text-paragraph-sm text-error-base">{error}</p>}
        {person && (
          <div className="mt-5 flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-3 text-paragraph-sm">
              <div><dt className="text-text-soft-400">Email</dt><dd>{person.person.email || "—"}{person.suppressionReason ? ` · suppressed (${person.suppressionReason})` : ""}</dd></div>
              <div><dt className="text-text-soft-400">Email status</dt><dd>{String(person.person.custom?.x_email_status ?? "—")}</dd></div>
              <div><dt className="text-text-soft-400">Phone</dt><dd>{person.person.phone || "—"}</dd></div>
              <div><dt className="text-text-soft-400">City</dt><dd>{String(person.person.custom?.x_city ?? "—")}, {String(person.person.custom?.x_country ?? "—")}</dd></div>
              <div><dt className="text-text-soft-400">Company</dt><dd>{person.company?.name || person.company?.domain || "—"}</dd></div>
              <div><dt className="text-text-soft-400">Source</dt><dd>{person.person.source}</dd></div>
            </dl>
            <label className="flex flex-col gap-1 text-label-sm text-text-strong-950">
              Notes
              <textarea className="min-h-24 rounded-lg border border-stroke-soft-200 p-2 text-paragraph-sm" value={note} onChange={(event) => setNote(event.target.value)} />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button.Root size="small" variant="primary" mode="filled" disabled={busy} onClick={() => void savePerson({ note })}>Save notes</Button.Root>
              <Button.Root size="small" variant="neutral" mode="stroke" disabled={busy} onClick={() => void savePerson({ doNotContact: !person.doNotContact, reason: "Marked from the lead profile" })}>
                {person.doNotContact ? "Clear do not contact" : "Do not contact"}
              </Button.Root>
              {wa && <a className="inline-flex items-center rounded-lg border border-stroke-soft-200 px-3 text-label-sm" href={wa} target="_blank" rel="noreferrer">WhatsApp</a>}
              <Button.Root size="small" variant="error" mode="stroke" disabled={busy} onClick={() => void remove()}>Delete</Button.Root>
            </div>
          </div>
        )}
        {company && (
          <div className="mt-5 flex flex-col gap-3 text-paragraph-sm">
            <p>Domain {company.company.domain}</p>
            <p>Status {String(company.company.custom?.x_account_status ?? "New")}</p>
            <p>Stage {String(company.company.custom?.x_account_stage ?? "—")}</p>
            <p>Hiring {String(company.company.custom?.x_roles_hiring ?? "—")}</p>
            {company.company.custom?.x_job_posting_url ? <a className="text-primary-base underline" href={String(company.company.custom.x_job_posting_url)}>Job posting</a> : null}
            <FindPeople companyId={company.company.id} onSaved={onChanged} />
            <Button.Root size="small" variant="error" mode="stroke" disabled={busy} onClick={() => void remove()}>Delete account</Button.Root>
          </div>
        )}
        <section className="mt-6">
          <h3 className="text-label-md text-text-strong-950">Timeline</h3>
          {activity.length === 0 ? <p className="mt-2 text-paragraph-sm text-text-sub-600">Nothing has been recorded yet.</p> : (
            <ul className="mt-2 flex flex-col gap-2">
              {activity.map((event) => (
                <li key={event.id} className="rounded-lg border border-stroke-soft-200 px-3 py-2 text-paragraph-sm">
                  <span className="text-text-soft-400">{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(event.createdAt))} IST</span>
                  <p>{event.summary}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}

function FindPeople({ companyId, onSaved }: { companyId: string; onSaved: () => void }) {
  const [title, setTitle] = useState("HR");
  const [provider, setProvider] = useState<"apollo" | "hunter">("apollo");
  const [people, setPeople] = useState<Array<{ email: string | null; fullName: string | null; title: string | null }>>([]);
  const [personIds, setPersonIds] = useState<string[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function search() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/leads/companies/${companyId}/find-people`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, jobTitle: title, save: true, indexes: picked.length ? picked : undefined }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Search failed");
      setPeople(body.people ?? []);
      setPersonIds(Array.isArray(body.personIds) ? body.personIds : []);
      setMessage(body.personIds ? `Saved ${body.personIds.length}. They are not enrolled until you add them to a sequence.` : "No one matched.");
      onSaved();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Search failed");
    } finally {
      setBusy(false);
    }
  }

  async function enroll() {
    if (!campaignId.trim()) return setMessage("Paste a campaign id to enroll the people you saved.");
    setBusy(true);
    try {
      const response = await fetch(`/api/leads/companies/${companyId}/find-people`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enroll: true, campaignId: campaignId.trim(), personIds }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not enroll");
      setMessage(`Added ${body.added}. Skipped DNC ${body.skippedDoNotContact}, suppressed ${body.skippedSuppressed}. Nothing was sent.`);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Could not enroll");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-stroke-soft-200 p-3">
      <p className="text-label-sm text-text-strong-950">Find people</p>
      <p className="mt-1 text-paragraph-xs text-text-sub-600">Uses a connected Apollo or Hunter account. Nothing is emailed from this step.</p>
      <div className="mt-2 flex flex-col gap-2">
        <input className="rounded-lg border border-stroke-soft-200 px-2 py-1.5 text-paragraph-sm" aria-label="Job title" value={title} onChange={(event) => setTitle(event.target.value)} />
        <select className="rounded-lg border border-stroke-soft-200 px-2 py-1.5 text-paragraph-sm" aria-label="Provider" value={provider} onChange={(event) => setProvider(event.target.value === "hunter" ? "hunter" : "apollo")}>
          <option value="apollo">Apollo — by job title</option>
          <option value="hunter">Hunter — emails at this domain</option>
        </select>
        <Button.Root size="small" variant="neutral" mode="stroke" disabled={busy} onClick={() => void search()}>Search and save</Button.Root>
        {people.length > 0 && (
          <ul className="max-h-32 overflow-auto text-paragraph-xs">
            {people.map((person, index) => (
              <li key={`${person.email}-${index}`}>
                <label className="flex gap-2">
                  <input type="checkbox" checked={picked.includes(index)} onChange={() => setPicked((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index])} />
                  <span>{person.fullName || person.email} · {person.title || "—"}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <input className="rounded-lg border border-stroke-soft-200 px-2 py-1.5 text-paragraph-sm" aria-label="Campaign id" placeholder="Email campaign id" value={campaignId} onChange={(event) => setCampaignId(event.target.value)} />
        <Button.Root size="small" variant="neutral" mode="ghost" disabled={busy} onClick={() => void enroll()}>Add saved people to sequence</Button.Root>
        {message && <p className="text-paragraph-xs text-text-sub-600">{message}</p>}
      </div>
    </div>
  );
}

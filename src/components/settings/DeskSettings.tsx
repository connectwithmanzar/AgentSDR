"use client";

import { useEffect, useState } from "react";
import * as Button from "@/components/alignui/button";
import * as Input from "@/components/alignui/input";

type Audit = { id: string; action: string; summary: string; actorRef: string | null; createdAt: string };

export function DeskSettings() {
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [events, setEvents] = useState<Audit[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    void fetch("/api/desk").then((response) => response.json()).then((body) => {
      setUrl(body.candidateAtsUrl ?? "");
    }).catch(() => undefined);
  }, []);

  async function save() {
    setMessage("");
    const response = await fetch("/api/desk", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateAtsUrl: url }),
    });
    const body = await response.json();
    setMessage(response.ok ? "Saved. Candidates stay in that system." : body.error ?? "Could not save");
  }

  async function loadAudit() {
    const response = await fetch(`/api/desk?view=audit&q=${encodeURIComponent(query)}`);
    const body = await response.json();
    if (!response.ok) {
      setMessage(body.error ?? "Could not load the audit log");
      return;
    }
    setEvents(body.events ?? []);
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-label-md text-text-strong-950">Candidate database</h2>
        <p className="text-paragraph-sm text-text-sub-600">
          FreeATS is the recommended external ATS. OpenCATS is the classic alternative. Paste an https link. AgentSDR does not store CVs.
        </p>
        <Input.Root size="small">
          <Input.Wrapper>
            <Input.Input aria-label="Candidate database URL" placeholder="https://" value={url} onChange={(event) => setUrl(event.target.value)} />
          </Input.Wrapper>
        </Input.Root>
        <div className="flex gap-2">
          <Button.Root size="small" variant="primary" mode="filled" onClick={() => void save()}>Save</Button.Root>
          {url.startsWith("https://") && <a className="inline-flex items-center text-label-sm text-primary-base" href={url} target="_blank" rel="noreferrer">Open ATS</a>}
        </div>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-label-md text-text-strong-950">Audit log</h2>
        <p className="text-paragraph-sm text-text-sub-600">Imports, edits, deletes, and Do Not Contact changes. Times are shown in India.</p>
        <div className="flex gap-2">
          <Input.Root size="small" className="flex-1">
            <Input.Wrapper>
              <Input.Input aria-label="Search audit log" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" />
            </Input.Wrapper>
          </Input.Root>
          <Button.Root size="small" variant="neutral" mode="stroke" onClick={() => void loadAudit()}>Search</Button.Root>
        </div>
        {events && (
          <ul className="flex flex-col gap-2">
            {events.length === 0 && <li className="text-paragraph-sm text-text-sub-600">Nothing recorded yet.</li>}
            {events.map((event) => (
              <li key={event.id} className="rounded-lg border border-stroke-soft-200 px-3 py-2 text-paragraph-sm">
                <span className="text-text-soft-400">{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(event.createdAt))} IST</span>
                <p>{event.summary}</p>
                {event.actorRef && <p className="text-paragraph-xs text-text-soft-400">{event.actorRef}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
      {message && <p className="text-paragraph-sm text-text-sub-600">{message}</p>}
    </div>
  );
}

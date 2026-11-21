"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const ITEMS = [
  { key: "import", label: "Import people, or enrich an account" },
  { key: "sequence", label: "Build a sequence and keep it as a draft" },
  { key: "approve", label: "Send only after a person approves the list" },
  { key: "replies", label: "Work replies in Action required" },
  { key: "accounts", label: "Use Accounts and Find people" },
  { key: "candidates", label: "Keep candidates in the external ATS, not in Leads" },
];

export function GettingStarted() {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    void fetch("/api/desk").then((response) => response.json()).then((body) => {
      if (body.checklistDismissed) return;
      setDone(body.checklist ?? {});
      setOpen(true);
    }).catch(() => undefined);
  }, []);

  if (!open) return null;

  async function save(next: Record<string, boolean>, dismiss = false) {
    setDone(next);
    await fetch("/api/desk", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checklist: next, dismissChecklist: dismiss }),
    });
    if (dismiss) setOpen(false);
  }

  return (
    <section className="mt-5 rounded-xl border border-stroke-soft-200 bg-bg-white-0 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-label-md text-text-strong-950">Getting started</h2>
          <p className="mt-1 text-paragraph-sm text-text-sub-600">Career One Stop outreach is to companies that are hiring. Candidates stay in the ATS.</p>
        </div>
        <button type="button" className="text-label-sm text-text-sub-600" onClick={() => void save(done, true)}>Dismiss</button>
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {ITEMS.map((item) => (
          <li key={item.key}>
            <label className="flex items-center gap-2 text-paragraph-sm text-text-strong-950">
              <input
                type="checkbox"
                checked={Boolean(done[item.key])}
                onChange={(event) => void save({ ...done, [item.key]: event.target.checked })}
              />
              {item.label}
            </label>
          </li>
        ))}
      </ul>
      <Link className="mt-3 inline-block text-label-sm text-primary-base" href="/guide">How to use it</Link>
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";
import * as Input from "@/components/alignui/input";

type Row = { id: string; action: string; summary: string; actorRef: string | null; createdAtIst: string };

export function AuditLog() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void fetch(`/api/desk?view=audit&q=${encodeURIComponent(q)}`)
        .then(async (response) => {
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(body.error ?? "Could not load the audit log");
          const events = Array.isArray(body.events) ? body.events : [];
          setRows(events.map((row: { id: string; action: string; summary: string; actorRef: string | null; createdAt: string }) => ({
            id: row.id,
            action: row.action,
            summary: row.summary,
            actorRef: row.actorRef,
            createdAtIst: new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(row.createdAt)),
          })));
          setError("");
        })
        .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load the audit log"));
    }, 200);
    return () => window.clearTimeout(handle);
  }, [q]);

  return (
    <div className="flex flex-col gap-3">
      <Input.Root>
        <Input.Wrapper>
          <Input.Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search actions" aria-label="Search the audit log" />
        </Input.Wrapper>
      </Input.Root>
      {error && <p className="text-paragraph-sm text-error-base">{error}</p>}
      {rows.length === 0 && !error ? <p className="text-paragraph-sm text-text-sub-600">No audit events match.</p> : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.id} className="rounded-lg border border-stroke-soft-200 px-3 py-2 text-paragraph-sm">
              <span className="text-text-soft-400">{row.createdAtIst} IST</span>
              <p>{row.summary}</p>
              <p className="text-text-soft-400">{row.action}{row.actorRef ? ` · ${row.actorRef}` : ""}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import * as Button from "@/components/alignui/button";
import * as Input from "@/components/alignui/input";
import type { PersonRow } from "./leadTypes";

export function LeadBulkBar({
  ids,
  rows,
  onDone,
}: {
  ids: string[];
  rows: PersonRow[];
  onDone: (message: string) => void;
}) {
  const [campaignId, setCampaignId] = useState("");
  const [busy, setBusy] = useState(false);
  if (!ids.length) return null;

  async function run(action: "dnc" | "campaign", extra: Record<string, unknown> = {}) {
    setBusy(true);
    try {
      const response = await fetch("/api/leads/people/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids, ...extra }),
      });
      const body = await response.json();
      if (!response.ok) {
        onDone(body.error ?? "Could not update the selection");
        return;
      }
      if (action === "dnc") onDone(`Marked ${body.updated} people Do Not Contact. Nothing was sent.`);
      else onDone(`Added ${body.added}. Skipped ${body.skippedDoNotContact} Do Not Contact and ${body.skippedSuppressed} suppressed. Nothing was sent.`);
    } finally {
      setBusy(false);
    }
  }

  function exportRows() {
    const chosen = new Set(ids);
    const lines = ["name,email,company,email status,city,country"];
    for (const row of rows) {
      if (!chosen.has(row.person.id)) continue;
      const custom = row.person.custom ?? {};
      const cells = [
        row.person.fullName,
        row.person.email,
        row.company?.name,
        custom.x_email_status,
        custom.x_city,
        custom.x_country,
      ].map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`);
      lines.push(cells.join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "people.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-stroke-soft-200 px-3 py-2">
      <p className="text-label-sm text-text-strong-950">{ids.length} selected</p>
      <Button.Root size="xsmall" variant="neutral" mode="stroke" disabled={busy} onClick={() => void run("dnc", { on: true })}>Do not contact</Button.Root>
      <Input.Root size="xsmall" className="w-56">
        <Input.Wrapper>
          <Input.Input aria-label="Draft campaign id" placeholder="Draft campaign id" value={campaignId} onChange={(event) => setCampaignId(event.target.value)} />
        </Input.Wrapper>
      </Input.Root>
      <Button.Root size="xsmall" variant="neutral" mode="stroke" disabled={busy || !campaignId.trim()} onClick={() => void run("campaign", { campaignId: campaignId.trim() })}>Add to draft</Button.Root>
      <Button.Root size="xsmall" variant="neutral" mode="ghost" disabled={busy} onClick={exportRows}>Export</Button.Root>
    </div>
  );
}

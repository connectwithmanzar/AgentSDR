"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- the template is a file download from an API route, not a page */

import { useRef, useState } from "react";
import { RiDownloadLine, RiUploadCloud2Line } from "@remixicon/react";
import * as Button from "@/components/alignui/button";
import * as Modal from "@/components/alignui/modal";

type ImportTarget = { key: string; label: string };
type Merge = { domain: string; action: "create" | "reuse"; currentName: string | null; incomingName: string | null; nameWouldChange: boolean };
type Preview = { headers: string[]; targets: ImportTarget[]; mapping: Record<string, string>; merges: Merge[] };
type ImportResult = { total: number; created: number; updated: number; failed: Array<{ row: number; identity: string; error: string }> };

export function PeopleImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [overwrite, setOverwrite] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

  async function loadPreview(next: File) {
    setSubmitting(true);
    setError("");
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", next);
      form.append("preview", "1");
      const response = await fetch("/api/leads/people/import", { method: "POST", body: form });
      const data = await response.json() as Preview & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not read the file");
      setPreview(data);
      setMapping(data.mapping);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read the file");
    } finally {
      setSubmitting(false);
    }
  }

  async function submit() {
    if (!file) return;
    setSubmitting(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("mapping", JSON.stringify(mapping));
      form.append("overwriteCompanies", overwrite ? "1" : "0");
      const response = await fetch("/api/leads/people/import", { method: "POST", body: form });
      const data = await response.json() as ImportResult & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Import failed");
      setResult(data);
      onImported();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Import failed");
    } finally {
      setSubmitting(false);
    }
  }

  const renames = preview?.merges.filter((row) => row.nameWouldChange) ?? [];

  return (
    <Modal.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Modal.Content size="max-w-lg">
        <Modal.Header icon={RiUploadCloud2Line}>
          <Modal.Title>Import people</Modal.Title>
          <Modal.Description>Map columns onto lead fields. An existing company is reused by domain and is not renamed unless you opt in.</Modal.Description>
        </Modal.Header>
        <Modal.Body>
          <a href="/api/leads/people/import/template" className="inline-flex items-center gap-1.5 text-label-sm text-primary-base hover:underline"><RiDownloadLine className="size-4" aria-hidden="true" />Download Excel template</a>
          <label className="mt-3 flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed border-stroke-soft-200 px-4 py-6 text-center transition hover:border-primary-base hover:bg-bg-weak-50">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="sr-only"
              onChange={(event) => {
                const next = event.target.files?.[0] ?? null;
                setFile(next);
                setPreview(null);
                if (next) void loadPreview(next);
              }}
            />
            <RiUploadCloud2Line className="size-6 text-text-soft-400" aria-hidden="true" />
            <span className="text-paragraph-sm text-text-sub-600">{file?.name || "Choose an .xlsx or .csv file"}</span>
          </label>
          {preview && (
            <div className="mt-4 flex max-h-64 flex-col gap-2 overflow-auto">
              {preview.headers.map((header, index) => (
                <label key={`${header}-${index}`} className="grid grid-cols-2 items-center gap-2 text-paragraph-sm">
                  <span className="truncate text-text-sub-600">{header || `Column ${index + 1}`}</span>
                  <select
                    className="rounded-lg border border-stroke-soft-200 bg-bg-white-0 px-2 py-1"
                    value={mapping[String(index)] ?? ""}
                    onChange={(event) => setMapping((current) => ({ ...current, [String(index)]: event.target.value }))}
                  >
                    <option value="">Keep as merge field</option>
                    {preview.targets.map((target) => <option key={target.key} value={target.key}>{target.label}</option>)}
                  </select>
                </label>
              ))}
              {renames.length > 0 && (
                <label className="mt-2 flex items-start gap-2 text-paragraph-sm text-text-strong-950">
                  <input type="checkbox" checked={overwrite} onChange={(event) => setOverwrite(event.target.checked)} />
                  <span>Overwrite company names for {renames.length} existing domain{renames.length === 1 ? "" : "s"} ({renames.slice(0, 3).map((row) => row.domain).join(", ")}).</span>
                </label>
              )}
            </div>
          )}
          {error && <p role="alert" className="mt-3 text-paragraph-sm text-error-base">{error}</p>}
          {result && (
            <div className="mt-4 rounded-xl bg-bg-weak-50 p-3 text-paragraph-sm text-text-sub-600">
              <p>{result.total} processed · {result.created} created · {result.updated} updated · {result.failed.length} failed</p>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button.Root variant="neutral" mode="stroke" size="small" onClick={onClose}>{result ? "Done" : "Cancel"}</Button.Root>
          {!result && <Button.Root variant="primary" mode="filled" size="small" disabled={!preview || submitting} onClick={() => void submit()}>{submitting ? "Working…" : "Import"}</Button.Root>}
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}

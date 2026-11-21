"use client";

import { useEffect, useState } from "react";
import * as Button from "@/components/alignui/button";
import * as Input from "@/components/alignui/input";

export function CandidateDatabaseForm() {
  const [url, setUrl] = useState("");
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/desk")
      .then((response) => response.json())
      .then((body) => setUrl(body.candidateAtsUrl ?? ""))
      .catch(() => setError("Could not load the saved URL."));
  }, []);

  return (
    <form
      className="flex max-w-xl flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        setError("");
        void fetch("/api/desk", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ candidateAtsUrl: url }),
        })
          .then(async (response) => {
            const body = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(body.error ?? "Could not save");
            setSaved("Saved. The link is in the sidebar as How to use it, and here.");
          })
          .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not save"));
      }}
    >
      <p className="text-paragraph-sm text-text-sub-600">
        Candidates are not stored in this desk. FreeATS is the recommended database. OpenCATS is an alternative if you already run it.
      </p>
      <Input.Root>
        <Input.Wrapper>
          <Input.Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://ats.example.com" aria-label="Candidate database URL" />
        </Input.Wrapper>
      </Input.Root>
      {error && <p className="text-paragraph-sm text-error-base">{error}</p>}
      {saved && <p className="text-paragraph-sm text-text-sub-600">{saved}</p>}
      <div>
        <Button.Root type="submit" size="small" variant="primary" mode="filled">Save URL</Button.Root>
      </div>
    </form>
  );
}

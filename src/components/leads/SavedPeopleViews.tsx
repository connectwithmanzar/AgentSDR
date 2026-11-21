"use client";

import { useEffect, useState } from "react";
import * as Button from "@/components/alignui/button";
import * as Input from "@/components/alignui/input";
import { parseFieldFilters } from "@/lib/leads/filters";
import { EMPTY_FILTERS, peopleFieldFilters, type Direction, type PeopleFilters } from "./leadTypes";

type View = {
  id: string;
  name: string;
  filters: { items?: { key: string; op: string; value?: string }[] };
  sortKey: string;
  sortDirection: Direction;
};

export function SavedPeopleViews({
  filters,
  sort,
  direction,
  onApply,
}: {
  filters: PeopleFilters;
  sort: string;
  direction: Direction;
  onApply: (next: { filters: PeopleFilters; sort: string; direction: Direction }) => void;
}) {
  const [views, setViews] = useState<View[]>([]);
  const [name, setName] = useState("");

  async function reload() {
    const response = await fetch("/api/leads/views?entity=person");
    if (!response.ok) return;
    const body = await response.json();
    setViews(Array.isArray(body.views) ? body.views : []);
  }

  useEffect(() => {
    // Load saved views after mount. The fetch resolves before setState.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, []);

  async function save() {
    if (!name.trim()) return;
    await fetch("/api/leads/views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        entity: "person",
        columns: [],
        filters: parseFieldFilters(peopleFieldFilters(filters)),
        sortKey: sort,
        sortDirection: direction,
      }),
    });
    setName("");
    await reload();
  }

  function apply(id: string) {
    const view = views.find((item) => item.id === id);
    if (!view) return;
    const next = { ...EMPTY_FILTERS };
    for (const item of view.filters?.items ?? []) {
      if (item.key === "x_email_status") next.emailStatus = item.value ?? "";
      if (item.key === "x_city") next.city = item.value ?? "";
      if (item.key === "x_country") next.country = item.value ?? "";
      if (item.key === "do_not_contact" && (item.op === "true" || item.op === "false")) next.dnc = item.op;
    }
    onApply({ filters: next, sort: view.sortKey || sort, direction: view.sortDirection === "asc" ? "asc" : "desc" });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 pb-2">
      <label className="text-paragraph-xs text-text-soft-400">
        Saved view
        <select className="ml-2 rounded-md border border-stroke-soft-200 bg-bg-white-0 px-2 py-1 text-paragraph-sm" aria-label="Saved view" defaultValue="" onChange={(event) => apply(event.target.value)}>
          <option value="">Choose</option>
          {views.map((view) => <option key={view.id} value={view.id}>{view.name}</option>)}
        </select>
      </label>
      <Input.Root size="xsmall" className="w-40">
        <Input.Wrapper>
          <Input.Input aria-label="View name" placeholder="Name this view" value={name} onChange={(event) => setName(event.target.value)} />
        </Input.Wrapper>
      </Input.Root>
      <Button.Root size="xsmall" variant="neutral" mode="stroke" disabled={!name.trim()} onClick={() => void save()}>Save view</Button.Root>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Day = {
  timeZone: string;
  mailboxConnected: boolean;
  sentToday: number;
  dailyCap: number;
  replies: number;
  bounced: number;
  queueLeft: number;
  interested: number;
  openMandates: number;
  rolesHiring: number;
};

const EMPTY: Day = { timeZone: "Asia/Kolkata", mailboxConnected: false, sentToday: 0, dailyCap: 0, replies: 0, bounced: 0, queueLeft: 0, interested: 0, openMandates: 0, rolesHiring: 0 };

export function RecruiterDay() {
  const [day, setDay] = useState<Day | null>(null);

  useEffect(() => {
    void fetch("/api/desk?view=day").then((response) => response.ok ? response.json() : null).then((body) => {
      if (body) setDay(body as Day);
    }).catch(() => setDay(EMPTY));
  }, []);

  const today = new Intl.DateTimeFormat("en-IN", { dateStyle: "full", timeZone: "Asia/Kolkata" }).format(new Date());
  const stats = day ?? EMPTY;

  return (
    <section className="mb-5 rounded-xl border border-stroke-soft-200 bg-bg-white-0 p-4" aria-busy={day === null}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-label-md text-text-strong-950">Today in India</h2>
        <p className="text-paragraph-xs text-text-soft-400">{today} · Asia/Kolkata</p>
      </div>
      {day === null ? <p className="mt-3 text-paragraph-sm text-text-sub-600">Loading today’s numbers…</p> : (
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Sent", `${stats.sentToday} / ${stats.dailyCap || "—"}`],
            ["Replies", String(stats.replies)],
            ["Interested", String(stats.interested)],
            ["Bounced", String(stats.bounced)],
            ["Queue left", String(stats.queueLeft)],
            ["Open mandates", String(stats.openMandates)],
            ["Roles hiring", String(stats.rolesHiring)],
            ["Mailbox", stats.mailboxConnected ? "Connected" : "Not connected"],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-paragraph-xs text-text-soft-400">{label}</dt>
              <dd className="text-label-md tabular-nums text-text-strong-950">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="mt-3 text-paragraph-xs text-text-sub-600">
        Sending hours and the daily cap are edited in <Link className="text-primary-base" href="/settings/email-rules">Settings → Email → Sending rules</Link>. Those rules apply when a person starts a campaign, not when a draft is pushed in.
      </p>
    </section>
  );
}

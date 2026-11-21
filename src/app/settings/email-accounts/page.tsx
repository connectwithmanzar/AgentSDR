import Link from "next/link";
import AddMailboxButton from "@/components/outreach/AddMailboxButton";
import MailboxesPageClient from "@/components/outreach/MailboxesPageClient";
import { RequiresPlatform } from "@/components/settings/RequiresPlatform";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { requirePageOrgContext } from "@/lib/auth/context";
import { runInOrganization } from "@/lib/tenancy/scope";
import { listMailboxes } from "@/lib/outreach/mailboxes";

export const dynamic = "force-dynamic";

export const metadata = { title: "Email accounts" };

async function Mailboxes() {
  const ctx = await requirePageOrgContext();
  const mailboxes = await runInOrganization(ctx.organizationId, () => listMailboxes());
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-stroke-soft-200 p-4" aria-labelledby="deliverability">
        <h3 id="deliverability" className="text-label-md text-text-strong-950">Deliverability</h3>
        <p className="mt-1 text-paragraph-sm text-text-sub-600">SPF, DKIM and DMARC are not stored in AgentSDR. Check those records with the domain host. Hours and the daily cap live in sending rules.</p>
        {mailboxes.length === 0 ? <p className="mt-3 text-paragraph-sm text-text-sub-600">No mailbox is connected yet.</p> : (
          <ul className="mt-3 flex flex-col gap-2 text-paragraph-sm">
            {mailboxes.map((mailbox) => (
              <li key={mailbox.id}>
                {mailbox.emailAddress} · {mailbox.status} · {mailbox.dailySendLimit} a day
                {mailbox.lastTestedAt ? ` · last check ${new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(mailbox.lastTestedAt)} IST` : ""}
                {mailbox.lastHistoryId ? " · Gmail history is present" : " · no Gmail history id yet"}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 flex gap-4 text-label-sm">
          <Link className="underline" href="/settings/email-rules">Sending rules</Link>
          <Link className="underline" href="/settings/email-connection">Connection</Link>
        </p>
      </section>
      <MailboxesPageClient mailboxes={mailboxes} />
    </div>
  );
}

export default function EmailAccountsPage() {
  return (
    <SettingsPage
      title="Email accounts"
      description="The mailboxes outreach campaigns send from."
      actions={
        <RequiresPlatform platform="google" fallback={null}>
          <AddMailboxButton />
        </RequiresPlatform>
      }
    >
      <RequiresPlatform platform="google">
        <Mailboxes />
      </RequiresPlatform>
    </SettingsPage>
  );
}

import Link from "next/link";

export const metadata = { title: "How to use it" };

const STEPS = [
  "Sign in and stay in your Career One Stop organization. Every lead belongs to that organization.",
  "Connect a mailbox under Settings → Email before any campaign can send. This guide does not send mail.",
  "Import companies and the people who work there. Map City, Country and Email status. Do not overwrite a company name unless you mean to.",
  "Review Do Not Contact and suppressed addresses before you enroll anyone.",
  "Build a draft campaign, check the lead count, then start it only when the count is at least one.",
  "Keep candidates in the external ATS. The URL is under Settings → Candidate database. This desk is for companies that hire.",
];

export default function GuidePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <div>
        <h1 className="text-title-h5 text-text-strong-950">How to use the recruiter desk</h1>
        <p className="mt-2 text-paragraph-sm text-text-sub-600">
          Career One Stop recruits for companies in India and the UAE. The team is in Delhi. There is no Dubai office, and sequences do not quote fees.
        </p>
      </div>
      <ol className="flex list-decimal flex-col gap-3 pl-5 text-paragraph-sm text-text-strong-950">
        {STEPS.map((step) => <li key={step}>{step}</li>)}
      </ol>
      <p className="text-paragraph-sm text-text-sub-600">
        The product quickstart is on <a className="underline" href="https://docs.agentsdr.ai/quickstart">docs.agentsdr.ai</a>.
        Staff training notes stay out of Knowledge. Knowledge is what the AI may say to a lead.
      </p>
      <Link className="text-label-sm text-primary-base" href="/leads">Open people</Link>
    </main>
  );
}

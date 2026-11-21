import { CandidateDatabaseForm } from "@/components/settings/CandidateDatabaseForm";
import { SettingsPage } from "@/components/settings/SettingsPage";

export const metadata = { title: "Candidate database" };
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <SettingsPage title="Candidate database" description="Where candidates live. This desk stays a B2B account list." width="narrow">
      <CandidateDatabaseForm />
    </SettingsPage>
  );
}

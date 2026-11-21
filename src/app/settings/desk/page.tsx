import { DeskSettings } from "@/components/settings/DeskSettings";
import { SettingsPage } from "@/components/settings/SettingsPage";

export const metadata = { title: "Candidate database" };

export default function DeskSettingsPage() {
  return (
    <SettingsPage title="Candidate database" description="An external ATS for candidates. This desk stays for companies that are hiring." width="narrow">
      <DeskSettings />
    </SettingsPage>
  );
}

import { AuditLog } from "@/components/settings/AuditLog";
import { SettingsPage } from "@/components/settings/SettingsPage";

export const metadata = { title: "Audit log" };
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <SettingsPage title="Audit log" description="Changes owners and admins can review. Times are India Standard Time." width="narrow">
      <AuditLog />
    </SettingsPage>
  );
}

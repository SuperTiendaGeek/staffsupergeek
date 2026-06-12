import { AppLauncher } from "@/components/AppLauncher";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { getVisibleStaffApps } from "@/lib/apps";
import { getSessionFromCookie } from "@/lib/session";

export default async function DashboardPage() {
  const session = await getSessionFromCookie();
  const visibleApps = getVisibleStaffApps(session);

  return (
    <StaffAppShell activeHref="/dashboard" sectionLabel="Portal Staff">
      <AppLauncher apps={visibleApps} />
    </StaffAppShell>
  );
}

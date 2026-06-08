import { AppLauncher } from "@/components/AppLauncher";
import { PortalShell } from "@/components/PortalShell";
import { getVisibleStaffApps } from "@/lib/apps";
import { getSessionFromCookie } from "@/lib/session";

export default async function DashboardPage() {
  const session = await getSessionFromCookie();
  const visibleApps = getVisibleStaffApps(session);

  return (
    <PortalShell
      eyebrow="Launcher interno"
      title="SUPER GEEK"
    >
      <AppLauncher apps={visibleApps} />
    </PortalShell>
  );
}

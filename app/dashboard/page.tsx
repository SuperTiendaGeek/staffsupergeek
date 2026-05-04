import { AppLauncher } from "@/components/AppLauncher";
import { PortalShell } from "@/components/PortalShell";
import { canAccessApp, isAdministratorRole, staffApps } from "@/lib/apps";
import { getSessionFromCookie } from "@/lib/session";

export default async function DashboardPage() {
  const session = await getSessionFromCookie();
  const visibleApps = staffApps.filter((app) => {
    if (app.id === "usuarios") {
      return isAdministratorRole(session?.user.rol);
    }

    return canAccessApp(session, app.permissionName);
  });

  return (
    <PortalShell
      eyebrow="Launcher interno"
      title="Portal Staff SUPER GEEK"
      description="Accede a las herramientas internas del equipo desde un solo lugar."
    >
      <AppLauncher apps={visibleApps} />
    </PortalShell>
  );
}

import { redirect } from "next/navigation";
import { NotificationsHistoryClient } from "@/components/notifications/NotificationsHistoryClient";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { obtenerNotificacionesUsuario } from "@/lib/notificaciones/airtable";
import { getSessionFromCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function NotificacionesPage() {
  const session = await getSessionFromCookie();

  if (!session) {
    redirect("/login");
  }

  const notifications = await obtenerNotificacionesUsuario(session.user.userId, { limit: 100, includeArchived: true });

  return (
    <StaffAppShell activeHref="/notificaciones" sectionLabel="Portal Staff">
      <NotificationsHistoryClient notifications={notifications} />
    </StaffAppShell>
  );
}

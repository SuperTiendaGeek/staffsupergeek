import { redirect } from "next/navigation";
import { NotificationsHistoryClient } from "@/components/notifications/NotificationsHistoryClient";
import { PortalShell } from "@/components/PortalShell";
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
    <PortalShell
      eyebrow="Portal Staff"
      title="Notificaciones"
      description="Historial de avisos internos, tareas y eventos relevantes para tu usuario."
    >
      <NotificationsHistoryClient notifications={notifications} />
    </PortalShell>
  );
}

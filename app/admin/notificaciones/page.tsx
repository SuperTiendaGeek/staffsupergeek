import { redirect } from "next/navigation";
import { AdminNotificacionesClient } from "@/components/admin/AdminNotificacionesClient";
import { PortalShell } from "@/components/PortalShell";
import { getAdminSession } from "@/lib/admin-auth";
import { listPortalUsers } from "@/lib/airtable";
import { obtenerNotificacionesAdmin } from "@/lib/notificaciones/airtable";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{
    usuarioId?: string | string[];
    estado?: string | string[];
    tipo?: string | string[];
    prioridad?: string | string[];
  }>;
};

function getParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminNotificacionesPage({ searchParams }: PageProps) {
  const session = await getAdminSession();

  if (!session) {
    redirect("/acceso-denegado");
  }

  const params = await searchParams;
  const [users, notifications] = await Promise.all([
    listPortalUsers(),
    obtenerNotificacionesAdmin({
      usuarioId: getParam(params?.usuarioId),
      estado: getParam(params?.estado),
      tipo: getParam(params?.tipo),
      prioridad: getParam(params?.prioridad),
      limit: 100
    })
  ]);

  return (
    <PortalShell
      eyebrow="Administración"
      title="Notificaciones"
      description="Consulta y crea notificaciones internas para el equipo."
    >
      <AdminNotificacionesClient initialNotifications={notifications} users={users} />
    </PortalShell>
  );
}

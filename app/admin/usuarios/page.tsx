import { redirect } from "next/navigation";
import { AdminUsersClient } from "@/components/admin/AdminUsersClient";
import { PortalShell } from "@/components/PortalShell";
import { getAdminSession } from "@/lib/admin-auth";
import { listPortalUsers } from "@/lib/airtable";
import { staffApps } from "@/lib/apps";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const session = await getAdminSession();

  if (!session) {
    redirect("/acceso-denegado");
  }

  const users = await listPortalUsers();
  const availableApps = staffApps
    .filter((app) => app.id !== "usuarios")
    .map((app) => app.permissionName);

  return (
    <PortalShell
      eyebrow="Administración"
      title="Usuarios del portal"
      description="Administra cuentas, permisos y estados de acceso del portal Staff SUPER GEEK."
    >
      <AdminUsersClient
        initialUsers={users}
        availableApps={availableApps}
        currentUserId={session.user.userId}
      />
    </PortalShell>
  );
}

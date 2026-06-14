import { redirect } from "next/navigation";
import { AdminUsersClient } from "@/components/admin/AdminUsersClient";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
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
  const availableApps = [
    ...new Set(
      staffApps
        .filter((app) => app.permissionName !== "Administración")
        .map((app) => app.permissionName)
    )
  ];

  return (
    <StaffAppShell activeHref="/admin/usuarios" sectionLabel="Administración">
      <AdminUsersClient
        initialUsers={users}
        availableApps={availableApps}
        currentUserId={session.user.userId}
      />
    </StaffAppShell>
  );
}

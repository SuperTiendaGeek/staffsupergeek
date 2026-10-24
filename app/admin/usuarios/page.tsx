import { redirect } from "next/navigation";
import { AdminUsersClient } from "@/components/admin/AdminUsersClient";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { getAdminSession } from "@/lib/admin-auth";
import { listPortalUsers } from "@/lib/airtable";
import { staffApps } from "@/lib/apps";

export const dynamic = "force-dynamic";

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

function primero(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] ?? "" : v ?? "";
}

export default async function AdminUsersPage({ searchParams }: PageProps) {
  const session = await getAdminSession();

  if (!session) {
    redirect("/acceso-denegado");
  }

  const users = await listPortalUsers();
  const sp = (await searchParams) ?? {};
  const nuevo = primero(sp.nuevo).trim();
  const prefill = nuevo ? { email: nuevo, nombre: primero(sp.nombre).trim(), rol: primero(sp.rol).trim() || "Proveedor" } : undefined;
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
        prefill={prefill}
      />
    </StaffAppShell>
  );
}

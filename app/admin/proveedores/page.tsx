import { redirect } from "next/navigation";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { getAdminSession } from "@/lib/admin-auth";
import { listPortalUsers } from "@/lib/airtable";
import { getProveedoresAdmin } from "@/lib/shipping-v2/airtable";
import type { ProveedorAdmin } from "@/lib/shipping-v2/proveedores-admin";
import { ProveedoresClient, type UsuarioPortalResumen } from "./ProveedoresClient";

export const dynamic = "force-dynamic";

// Administrar › Proveedores (auditoría Shipping V2, punto 11, 22-oct-2026).
// Solo el rol Administrador (el proxy ya cierra /admin a los demás).

export default async function AdminProveedoresPage() {
  const session = await getAdminSession();
  if (!session) redirect("/acceso-denegado");

  let proveedores: ProveedorAdmin[] = [];
  let usuarios: Record<string, UsuarioPortalResumen> = {};
  let error = "";
  const [resProveedores, resUsuarios] = await Promise.allSettled([getProveedoresAdmin(), listPortalUsers()]);
  if (resProveedores.status === "fulfilled") proveedores = resProveedores.value;
  else {
    console.error("Error al cargar proveedores:", resProveedores.reason);
    error = "No se pudieron cargar los proveedores. Recarga la página.";
  }
  if (resUsuarios.status === "fulfilled") {
    usuarios = Object.fromEntries(
      resUsuarios.value
        .filter((u) => u.email)
        .map((u) => [u.email.trim().toLowerCase(), { nombre: u.nombre, rol: u.rol, activo: u.activo }])
    );
  }

  return (
    <StaffAppShell activeHref="/admin/proveedores" sectionLabel="Administrar">
      <div className="w-full max-w-none space-y-3">
        {error ? (
          <section className="rounded-xl border border-orange-300/25 bg-orange-300/10 p-3 text-sm text-orange-100">{error}</section>
        ) : null}
        <ProveedoresClient inicial={proveedores} usuarios={usuarios} usuariosCargados={resUsuarios.status === "fulfilled"} />
      </div>
    </StaffAppShell>
  );
}

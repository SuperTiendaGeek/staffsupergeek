import { redirect } from "next/navigation";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { getAdminSession } from "@/lib/admin-auth";
import { configPantallaAdmin, type ConfigPantallaAdmin } from "@/lib/pantalla-cliente/config-servidor";
import { AdminPantallaClienteClient } from "./AdminPantallaClienteClient";

export const dynamic = "force-dynamic";

// Administrar › Pantalla del cliente (10E-C, maqueta 11 aprobada por el dueño
// el 18-nov-2026). Solo administradores.
export default async function AdminPantallaClientePage() {
  const session = await getAdminSession();
  if (!session) redirect("/acceso-denegado");
  let inicial: ConfigPantallaAdmin | null = null;
  try { inicial = await configPantallaAdmin(); } catch (e) { console.error("[admin pantalla cliente]", e); }
  return (
    <StaffAppShell activeHref="/admin/proveedores" sectionLabel="Administrar">
      <div className="w-full max-w-none space-y-3">
        <AdminTabs activa="/admin/pantalla-cliente" />
        {inicial
          ? <AdminPantallaClienteClient inicial={inicial} />
          : <section className="rounded-xl border border-orange-300/25 bg-orange-300/10 p-3 text-sm text-orange-100">No se pudieron cargar los ajustes. Recarga la página.</section>}
      </div>
    </StaffAppShell>
  );
}

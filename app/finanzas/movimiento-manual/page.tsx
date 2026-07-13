import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdministratorRole } from "@/lib/apps";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { StaffPageHeader } from "@/components/staff/StaffDesignSystem";
import { MovimientoManualForm } from "@/components/finanzas/MovimientoManualForm";
import { fetchCuentasFinancieras } from "@/lib/finanzas/cuentas";
import { getSessionFromCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function MovimientoManualPage() {
  const session = await getSessionFromCookie();
  if (!isAdministratorRole(session?.user.rol)) {
    redirect("/acceso-denegado");
  }

  const cuentas = await fetchCuentasFinancieras();

  return (
    <StaffAppShell activeHref="/finanzas" sectionLabel="Finanzas">
      <div className="w-full space-y-3">
        <StaffPageHeader title="Movimiento manual" description="Ingresos/egresos sueltos que ningún puente cubre (Fase 20.3)." density="compact" />
        <Link href="/finanzas" className="text-sm text-[#A7A7A7] transition hover:text-[#F5F5F5]">
          ← Volver a Finanzas
        </Link>
        <MovimientoManualForm cuentas={cuentas.filter((c) => c.activa).map((c) => ({ id: c.id, nombre: c.nombre }))} />
      </div>
    </StaffAppShell>
  );
}

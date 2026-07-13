import Link from "next/link";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { StaffPageHeader } from "@/components/staff/StaffDesignSystem";
import { DepositoForm } from "@/components/finanzas/DepositoForm";
import { fetchCuentasFinancieras } from "@/lib/finanzas/cuentas";

export const dynamic = "force-dynamic";

export default async function DepositosPage() {
  const cuentas = await fetchCuentasFinancieras();

  return (
    <StaffAppShell activeHref="/finanzas" sectionLabel="Finanzas">
      <div className="w-full space-y-3">
        <StaffPageHeader title="Registrar depósito de caja" description="Movimiento Interno entre cuentas (Fase 20.3)." density="compact" />
        <Link href="/finanzas" className="text-sm text-[#A7A7A7] transition hover:text-[#F5F5F5]">
          ← Volver a Finanzas
        </Link>
        <DepositoForm cuentas={cuentas.filter((c) => c.activa).map((c) => ({ id: c.id, nombre: c.nombre, permiteTransferirAIds: c.permiteTransferirAIds }))} />
      </div>
    </StaffAppShell>
  );
}

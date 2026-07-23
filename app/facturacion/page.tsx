import Link              from "next/link";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { FacturacionForm } from "@/components/facturacion/FacturacionForm";
import { getConsumidorFinalLimite } from "@/lib/facturacion/config";

export const dynamic = "force-dynamic";

export default function FacturacionPage() {
  return (
    <StaffAppShell activeHref="/facturacion" sectionLabel="Facturación">
      <div className="mb-4 flex justify-end gap-2">
        <Link
          href="/facturacion/proformas"
          className="rounded-full border border-[#3A3A36] px-4 py-2 text-sm text-[#A7A7A7] hover:border-[#D7FF4F]/60 hover:text-[#F5F5F5] transition"
        >
          Proformas
        </Link>
        <Link
          href="/facturacion/historial"
          className="rounded-full border border-[#3A3A36] px-4 py-2 text-sm text-[#A7A7A7] hover:border-[#D7FF4F]/60 hover:text-[#F5F5F5] transition"
        >
          Ver historial →
        </Link>
      </div>
      <FacturacionForm consumidorFinalLimite={getConsumidorFinalLimite()} />
    </StaffAppShell>
  );
}

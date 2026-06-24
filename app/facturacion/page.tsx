import Link              from "next/link";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { FacturacionForm } from "@/components/facturacion/FacturacionForm";

export const dynamic = "force-dynamic";

// Límite SRI para Consumidor Final. Ajustable vía env var CONSUMIDOR_FINAL_LIMITE.
// Default 50 (regla general del SRI). Si tu régimen permite $200, cambia la var.
function getConsumidorFinalLimite(): number {
  const raw = process.env.CONSUMIDOR_FINAL_LIMITE;
  const n   = parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 50;
}

export default function FacturacionPage() {
  return (
    <StaffAppShell activeHref="/facturacion" sectionLabel="Facturación">
      <div className="mb-4 flex justify-end">
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

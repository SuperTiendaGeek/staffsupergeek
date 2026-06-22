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
      <FacturacionForm consumidorFinalLimite={getConsumidorFinalLimite()} />
    </StaffAppShell>
  );
}

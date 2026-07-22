import { StaffAppShell }          from "@/components/staff/StaffAppShell";
import { HistorialNotasCredito }  from "@/components/facturacion/HistorialNotasCredito";

export const dynamic = "force-dynamic";

export default function HistorialNotasCreditoPage() {
  return (
    <StaffAppShell activeHref="/facturacion" sectionLabel="Facturación">
      <HistorialNotasCredito />
    </StaffAppShell>
  );
}

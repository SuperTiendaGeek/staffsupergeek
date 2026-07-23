import { StaffAppShell }     from "@/components/staff/StaffAppShell";
import { HistorialRecibos }  from "@/components/facturacion/HistorialRecibos";

export const dynamic = "force-dynamic";

export default function RecibosPage() {
  return (
    <StaffAppShell activeHref="/facturacion" sectionLabel="Facturación">
      <HistorialRecibos />
    </StaffAppShell>
  );
}

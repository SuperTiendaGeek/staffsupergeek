import { StaffAppShell }       from "@/components/staff/StaffAppShell";
import { HistorialProformas }  from "@/components/facturacion/HistorialProformas";

export const dynamic = "force-dynamic";

export default function ProformasPage() {
  return (
    <StaffAppShell activeHref="/facturacion" sectionLabel="Facturación">
      <HistorialProformas />
    </StaffAppShell>
  );
}

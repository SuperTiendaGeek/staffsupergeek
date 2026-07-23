import { StaffAppShell }         from "@/components/staff/StaffAppShell";
import { AnulacionesPendientes } from "@/components/facturacion/AnulacionesPendientes";

export const dynamic = "force-dynamic";

export default function AnulacionesPage() {
  return (
    <StaffAppShell activeHref="/facturacion" sectionLabel="Facturación">
      <AnulacionesPendientes />
    </StaffAppShell>
  );
}

import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { CatalogoDigitalClient } from "./CatalogoDigitalClient";

export const dynamic = "force-dynamic";

export default async function CatalogoProductosDigitalesPage() {
  return (
    <StaffAppShell
      activeHref="/tecnicos/productos-digitales/catalogo"
      sectionLabel="Técnicos"
    >
      <CatalogoDigitalClient />
    </StaffAppShell>
  );
}

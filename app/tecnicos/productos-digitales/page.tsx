import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { ProductosDigitalesClient } from "./ProductosDigitalesClient";

export const dynamic = "force-dynamic";

export default async function ProductosDigitalesPage() {
  return (
    <StaffAppShell activeHref="/tecnicos/productos-digitales" sectionLabel="Técnicos">
      <ProductosDigitalesClient />
    </StaffAppShell>
  );
}

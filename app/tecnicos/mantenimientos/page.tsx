import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { MantenimientosPageClient } from "./MantenimientosPageClient";

export const dynamic = "force-dynamic";

export default async function MantenimientosPage() {
  return (
    <StaffAppShell activeHref="/tecnicos/mantenimientos" sectionLabel="Técnicos">
      <MantenimientosPageClient />
    </StaffAppShell>
  );
}

import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { OrdenDetalleClient } from "./OrdenDetalleClient";

export const dynamic = "force-dynamic";

export default async function OrdenDetallePage() {
  return (
    <StaffAppShell activeHref="/tecnicos/ordenes" sectionLabel="Técnicos">
      <OrdenDetalleClient />
    </StaffAppShell>
  );
}

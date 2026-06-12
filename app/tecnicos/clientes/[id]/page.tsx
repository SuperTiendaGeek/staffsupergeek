import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { ClienteDetalleClient } from "./ClienteDetalleClient";

export const dynamic = "force-dynamic";

export default async function ClienteDetallePage() {
  return (
    <StaffAppShell activeHref="/tecnicos/clientes" sectionLabel="Técnicos">
      <ClienteDetalleClient />
    </StaffAppShell>
  );
}

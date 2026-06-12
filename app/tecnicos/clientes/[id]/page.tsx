import { PortalShell } from "@/components/PortalShell";
import { ClienteDetalleClient } from "./ClienteDetalleClient";

export const dynamic = "force-dynamic";

export default async function ClienteDetallePage() {
  return (
    <PortalShell
      activeHref="/tecnicos/clientes"
      sectionLabel="Técnicos"
      title="Cliente"
      hidePageHeader
    >
      <ClienteDetalleClient />
    </PortalShell>
  );
}

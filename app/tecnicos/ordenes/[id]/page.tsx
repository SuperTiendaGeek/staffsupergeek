import { PortalShell } from "@/components/PortalShell";
import { OrdenDetalleClient } from "./OrdenDetalleClient";

export const dynamic = "force-dynamic";

export default async function OrdenDetallePage() {
  return (
    <PortalShell
      eyebrow="Gestión de Reparaciones"
      title="Detalle de orden"
      activeHref="/tecnicos/ordenes"
      sectionLabel="Técnicos"
      density="compact"
    >
      <OrdenDetalleClient />
    </PortalShell>
  );
}

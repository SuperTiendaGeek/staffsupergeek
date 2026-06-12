import { PortalShell } from "@/components/PortalShell";
import { OrdenesPageClient } from "./OrdenesPageClient";

export const dynamic = "force-dynamic";

export default async function OrdenesPage() {
  return (
    <PortalShell
      eyebrow="Gestión de Reparaciones"
      title="Ordenes"
      activeHref="/tecnicos/ordenes"
      sectionLabel="Técnicos"
      density="compact"
    >
      <OrdenesPageClient />
    </PortalShell>
  );
}

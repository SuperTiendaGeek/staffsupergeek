import { PortalShell } from "@/components/PortalShell";
import { ClientesPageClient } from "./ClientesPageClient";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  return (
    <PortalShell
      eyebrow="Gestión de Reparaciones"
      title="Clientes"
      activeHref="/tecnicos/clientes"
      sectionLabel="Técnicos"
      density="compact"
    >
      <ClientesPageClient />
    </PortalShell>
  );
}

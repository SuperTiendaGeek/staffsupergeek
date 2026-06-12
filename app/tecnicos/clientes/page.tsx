import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { ClientesPageClient } from "./ClientesPageClient";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  return (
    <StaffAppShell activeHref="/tecnicos/clientes" sectionLabel="Técnicos">
      <ClientesPageClient />
    </StaffAppShell>
  );
}

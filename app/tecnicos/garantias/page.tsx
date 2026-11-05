import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { GarantiasPageClient } from "./GarantiasPageClient";

export const dynamic = "force-dynamic";

// Todas las garantías SUPER GEEK en una pantalla (auditoría ops, punto 20).
export default async function GarantiasPage() {
  return (
    <StaffAppShell activeHref="/tecnicos/garantias" sectionLabel="Técnicos">
      <GarantiasPageClient />
    </StaffAppShell>
  );
}

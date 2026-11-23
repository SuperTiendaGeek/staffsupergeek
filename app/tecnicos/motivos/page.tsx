import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { MotivosCatalogoClient } from "./MotivosCatalogoClient";

export const dynamic = "force-dynamic";

// Catálogo de motivos de ingreso (rediseño R7, tablero 8). Todos lo ven; solo un administrador lo cambia.
export default async function MotivosPage() {
  return (
    <StaffAppShell activeHref="/tecnicos/motivos" sectionLabel="Técnicos">
      <MotivosCatalogoClient />
    </StaffAppShell>
  );
}

import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { AjustesAlertasClient } from "./AjustesAlertasClient";

export const dynamic = "force-dynamic";

// Ajustes de las alertas de órdenes (rediseño R10, tablero 11). Todos lo ven; solo un administrador lo cambia.
export default async function AjustesAlertasPage() {
  return (
    <StaffAppShell activeHref="/tecnicos/ordenes" sectionLabel="Técnicos">
      <AjustesAlertasClient />
    </StaffAppShell>
  );
}

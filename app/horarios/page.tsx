import { HorariosClient } from "@/components/horarios/HorariosClient";
import { PortalShell } from "@/components/PortalShell";
import { isAdministratorRole } from "@/lib/apps";
import { getHorarioEstado } from "@/lib/horarios/airtable";
import { getSessionFromCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function HorariosPage() {
  const session = await getSessionFromCookie();
  let initialError = "";
  let estado = null;

  if (session) {
    try {
      estado = await getHorarioEstado(session.user);
    } catch (error) {
      console.error("Error al cargar control de horarios:", error);
      initialError = "No se pudo cargar el control de horarios. Revisa que las tablas de Airtable existan.";
    }
  }

  return (
    <PortalShell
      eyebrow="Control interno"
      title="Control de Horarios"
      description="Marca entrada, almuerzo, regreso y salida final con hora generada desde el servidor."
    >
      <HorariosClient
        initialEstado={estado}
        initialError={initialError}
        isAdmin={isAdministratorRole(session?.user.rol)}
      />
    </PortalShell>
  );
}

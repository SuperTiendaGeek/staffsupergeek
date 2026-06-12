import { HorariosClient } from "@/components/horarios/HorariosClient";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { isAdministratorRole } from "@/lib/apps";
import { fetchMiVistaHorarios, getHorarioEstado } from "@/lib/horarios/airtable";
import { getSessionFromCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function HorariosPage() {
  const session = await getSessionFromCookie();
  let initialError = "";
  let estado = null;
  let miVista = null;

  if (session) {
    try {
      [estado, miVista] = await Promise.all([
        getHorarioEstado(session.user),
        fetchMiVistaHorarios(session.user)
      ]);
    } catch (error) {
      console.error("Error al cargar control de horarios:", error);
      initialError = "No se pudo cargar el control de horarios. Revisa que las tablas de Airtable existan.";
    }
  }

  return (
    <StaffAppShell activeHref="/horarios" sectionLabel="Horarios">
      <HorariosClient
        initialEstado={estado}
        initialMiVista={miVista}
        initialError={initialError}
        isAdmin={isAdministratorRole(session?.user.rol)}
      />
    </StaffAppShell>
  );
}

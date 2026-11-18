import { redirect } from "next/navigation";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { getSessionFromCookie } from "@/lib/session";
import { puedeVerBandeja } from "@/lib/pagos-en-linea/bandeja";
import { isAdministratorRole } from "@/lib/apps";
import { PagosRecibidosClient } from "./PagosRecibidosClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pagos recibidos · SUPER GEEK" };

// Bandeja "Pagos recibidos" (maqueta 12, aprobada por el dueño el 18-nov-2026):
// todo lo que entra por PayPhone y DeUna; asignar los pagos sin referencia,
// revisar los que no se aplicaron solos, historial y cierre del día.
// Administradores y Staff; "No corresponde" y el cierre, solo Administradores.
export default async function PagosRecibidosPage() {
  const session = await getSessionFromCookie();
  if (!session) redirect("/login");
  if (!puedeVerBandeja(session.user.rol)) redirect("/acceso-denegado");
  return (
    <StaffAppShell activeHref="/pagos-recibidos" sectionLabel="Pagos recibidos">
      <PagosRecibidosClient admin={isAdministratorRole(session.user.rol)} />
    </StaffAppShell>
  );
}

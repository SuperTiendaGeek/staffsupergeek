import { redirect } from "next/navigation";

import { StaffAppShell }        from "@/components/staff/StaffAppShell";
import { FirmaPanel }           from "@/components/facturacion/FirmaPanel";
import { getSessionFromCookie } from "@/lib/session";
import { canAccessApp, isAdministratorRole } from "@/lib/apps";

export const dynamic = "force-dynamic";

// Administración de la firma electrónica — solo administrador.
//
// El guard real vive en el endpoint (requireFacturacionAdmin): este de aquí
// es para que un usuario sin permiso no vea la pantalla vacía, no para
// proteger los datos. La pantalla no recibe nada sensible por props.

export default async function FirmaPage() {
  const session = await getSessionFromCookie();

  if (!session) redirect("/login");
  if (!canAccessApp(session, "Facturación")) redirect("/");
  if (!isAdministratorRole(session.user.rol)) redirect("/facturacion");

  return (
    <StaffAppShell activeHref="/facturacion" sectionLabel="Facturación">
      <FirmaPanel />
    </StaffAppShell>
  );
}

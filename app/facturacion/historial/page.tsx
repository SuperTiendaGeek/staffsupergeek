import { redirect }       from "next/navigation";
import { StaffAppShell }  from "@/components/staff/StaffAppShell";
import { canAccessApp }   from "@/lib/apps";
import { getSessionFromCookie } from "@/lib/session";
import { HistorialFacturas } from "@/components/facturacion/HistorialFacturas";

export const dynamic = "force-dynamic";

export default async function HistorialFacturasPage() {
  const session = await getSessionFromCookie();
  if (!session)                         redirect("/login");
  if (!canAccessApp(session, "Facturación")) redirect("/");

  return (
    <StaffAppShell activeHref="/facturacion" sectionLabel="Facturación — Historial">
      <HistorialFacturas />
    </StaffAppShell>
  );
}

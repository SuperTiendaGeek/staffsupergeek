import { redirect }       from "next/navigation";
import { StaffAppShell }  from "@/components/staff/StaffAppShell";
import { canAccessApp }   from "@/lib/apps";
import { getSessionFromCookie } from "@/lib/session";
import { DocumentosFacturacion } from "@/components/facturacion/DocumentosFacturacion";
import { getConsumidorFinalLimite } from "@/lib/facturacion/config";

export const dynamic = "force-dynamic";

// Landing del módulo Facturación: pantalla única de documentos (facturas,
// recibos, proformas y notas de crédito) con buscador universal y barra de
// acciones contextual. El formulario de emisión vive en /facturacion/nueva.
export default async function FacturacionPage() {
  const session = await getSessionFromCookie();
  if (!session)                              redirect("/login");
  if (!canAccessApp(session, "Facturación")) redirect("/");

  return (
    <StaffAppShell activeHref="/facturacion" sectionLabel="Facturación">
      <DocumentosFacturacion consumidorFinalLimite={getConsumidorFinalLimite()} vendedorPorDefecto={session.user.nombre} />
    </StaffAppShell>
  );
}

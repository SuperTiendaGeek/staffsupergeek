import Link                from "next/link";
import { redirect }        from "next/navigation";
import { canAccessApp }    from "@/lib/apps";
import { getSessionFromCookie } from "@/lib/session";
import { obtenerReciboPorId } from "@/lib/facturacion/recibos/airtable";
import { getFacturacionConfig } from "@/lib/facturacion/config";
import { AutoPrint }       from "@/components/tecnicos/print/AutoPrint";
import { TicketRecibo }    from "@/components/facturacion/print/TicketRecibo";

export const dynamic = "force-dynamic";

// Vista de impresión térmica (80 mm) de un recibo (documento interno).
export default async function ImprimirReciboPage({ params }: { params: Promise<{ recordId: string }> }) {
  const session = await getSessionFromCookie();
  if (!session)                              redirect("/login");
  if (!canAccessApp(session, "Facturación")) redirect("/");

  const { recordId } = await params;
  const recibo = recordId ? await obtenerReciboPorId(recordId) : null;

  if (!recibo) {
    return (
      <main style={{ padding: 24, fontFamily: "Arial, Helvetica, sans-serif" }}>
        <h1>Recibo no encontrado</h1>
        <Link href="/facturacion">Volver</Link>
      </main>
    );
  }

  const cfg = getFacturacionConfig();

  return (
    <>
      <AutoPrint backHref="/facturacion" />
      <TicketRecibo
        emisor={{ nombreComercial: cfg.nombreComercial, razonSocial: cfg.razonSocial, ruc: cfg.ruc, dirMatriz: cfg.dirMatriz }}
        recibo={{
          numero:                recibo.numero,
          fecha:                 recibo.fecha,
          estado:                recibo.estado,
          clienteNombre:         recibo.clienteNombre,
          clienteIdentificacion: recibo.clienteIdentificacion,
          total:                 recibo.total,
          formaPago:             recibo.formaPago,
          nota:                  recibo.nota,
          lineas:                recibo.lineas,
        }}
      />
    </>
  );
}

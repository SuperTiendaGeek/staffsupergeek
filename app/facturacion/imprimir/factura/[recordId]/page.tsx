import Link                from "next/link";
import { redirect }        from "next/navigation";
import { canAccessApp }    from "@/lib/apps";
import { getSessionFromCookie } from "@/lib/session";
import { obtenerFactura }  from "@/lib/facturacion/airtable/facturas";
import { getFacturacionConfig } from "@/lib/facturacion/config";
import { parsearLineasFactura } from "@/lib/facturacion/print/lineasFactura";
import { AutoPrint }       from "@/components/tecnicos/print/AutoPrint";
import { TicketFactura }   from "@/components/facturacion/print/TicketFactura";

export const dynamic = "force-dynamic";

// Vista de impresión térmica (80 mm) de una factura. Se abre en pestaña nueva
// desde el botón "Imprimir 80 mm" y auto-dispara el diálogo de impresión.
export default async function ImprimirFacturaPage({ params }: { params: Promise<{ recordId: string }> }) {
  const session = await getSessionFromCookie();
  if (!session)                              redirect("/login");
  if (!canAccessApp(session, "Facturación")) redirect("/");

  const { recordId } = await params;
  const factura = recordId ? await obtenerFactura(recordId) : null;

  if (!factura) {
    return (
      <main style={{ padding: 24, fontFamily: "Arial, Helvetica, sans-serif" }}>
        <h1>Factura no encontrada</h1>
        <Link href="/facturacion">Volver</Link>
      </main>
    );
  }

  const cfg = getFacturacionConfig();
  const { items, formaPago } = parsearLineasFactura(factura.lineasJson);

  return (
    <>
      <AutoPrint backHref="/facturacion" />
      <TicketFactura
        emisor={{ nombreComercial: cfg.nombreComercial, razonSocial: cfg.razonSocial, ruc: cfg.ruc, dirMatriz: cfg.dirMatriz }}
        factura={{
          numeroFactura:         factura.numeroFactura,
          fechaEmision:          factura.fechaEmision,
          clienteNombre:         factura.clienteNombre,
          clienteIdentificacion: factura.clienteIdentificacion,
          subtotal:              factura.subtotal,
          iva:                   factura.iva,
          total:                 factura.total,
          items,
          formaPago,
          claveAcceso:           factura.claveAcceso,
          numeroAutorizacion:    factura.numeroAutorizacion,
          fechaAutorizacion:     factura.fechaAutorizacion,
          ambiente:              factura.ambiente,
        }}
      />
    </>
  );
}

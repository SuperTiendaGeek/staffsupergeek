import Link                from "next/link";
import { redirect }        from "next/navigation";
import { canAccessApp }    from "@/lib/apps";
import { getSessionFromCookie } from "@/lib/session";
import { obtenerReservaPorId } from "@/lib/facturacion/reservas/airtable";
import { getFacturacionConfig } from "@/lib/facturacion/config";
import { AutoPrint }       from "@/components/tecnicos/print/AutoPrint";
import { TicketReserva }   from "@/components/facturacion/print/TicketReserva";

export const dynamic = "force-dynamic";

// Impresión térmica de una reserva: DOS tickets en una pasada — constancia del
// cliente + etiqueta para el ítem.
export default async function ImprimirReservaPage({ params }: { params: Promise<{ recordId: string }> }) {
  const session = await getSessionFromCookie();
  if (!session)                              redirect("/login");
  if (!canAccessApp(session, "Facturación")) redirect("/");

  const { recordId } = await params;
  const reserva = recordId ? await obtenerReservaPorId(recordId) : null;

  if (!reserva) {
    return (
      <main style={{ padding: 24, fontFamily: "Arial, Helvetica, sans-serif" }}>
        <h1>Reserva no encontrada</h1>
        <Link href="/facturacion">Volver</Link>
      </main>
    );
  }

  const cfg = getFacturacionConfig();

  return (
    <>
      <AutoPrint backHref="/facturacion" />
      <TicketReserva
        emisor={{ nombreComercial: cfg.nombreComercial, razonSocial: cfg.razonSocial, ruc: cfg.ruc, dirMatriz: cfg.dirMatriz }}
        reserva={{
          numero:                reserva.numero,
          fecha:                 reserva.fecha,
          fechaLimite:           reserva.fechaLimite,
          plazoDias:             reserva.plazoDias,
          clienteNombre:         reserva.cliente.razonSocial,
          clienteIdentificacion: reserva.cliente.identificacion ?? "",
          clienteTelefono:       reserva.cliente.telefono ?? "",
          descripcionItem:       reserva.descripcionItem,
          precio:                reserva.precio,
          totalAbonado:          reserva.totalAbonado,
          abonos:                reserva.abonos.map((a) => ({ monto: a.monto, fecha: a.fecha, formaPago: a.formaPago })),
        }}
      />
    </>
  );
}

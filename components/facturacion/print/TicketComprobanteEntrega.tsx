import { EmisorHeader, TICKET_CSS, type EmisorTicket } from "./ticketShared";
import { cleanText } from "@/components/tecnicos/print/printUtils";
import { fechaHoraEntrega } from "@/lib/entrega/formato";
import type { ComprobanteEntrega } from "@/lib/entrega/comprobante";

// Ticket térmico de 80 mm de la entrega sin cobro (auditoría ops, punto 6).
// Mismo estilo que la factura, el recibo y el comprobante de garantía.

export function TicketComprobanteEntrega({ emisor, c }: { emisor: EmisorTicket; c: ComprobanteEntrega }) {
  return (
    <>
      <style>{TICKET_CSS}</style>
      <main className="ticket-page">
        <article className="ticket">
          <EmisorHeader emisor={emisor} />
          <div className="center doc-title">Comprobante de entrega</div>
          <div className="center doc-num">{c.numero}</div>
          <div className="aviso">DOCUMENTO NO TRIBUTARIO</div>

          <div className="sep" />
          <div className="row"><span className="label">Fecha:</span><span className="value">{fechaHoraEntrega(c.fecha)}</span></div>
          <div className="row"><span className="label">Orden:</span><span className="value">{c.orden.codigo}</span></div>
          {c.orden.equipo && <div className="row"><span className="label">Equipo:</span><span className="value">{cleanText(c.orden.equipo)}</span></div>}
          <div className="row"><span className="label">Cliente:</span><span className="value">{cleanText(c.cliente.nombre)}</span></div>
          {c.cliente.identificacion && <div className="row"><span className="label">Ident.:</span><span className="value">{c.cliente.identificacion}</span></div>}

          <div className="sep" />
          <div className="item">
            <div className="item-desc">{c.motivo}</div>
            {c.detalle && <div className="muted">{cleanText(c.detalle)}</div>}
          </div>
          <div className="row"><span className="label">Accesorios:</span><span className="value">{c.accesorios ? cleanText(c.accesorios) : "Ninguno"}</span></div>
          {c.estado && <div className="row"><span className="label">Estado:</span><span className="value">{cleanText(c.estado)}</span></div>}
          <div className="row"><span className="label">Retira:</span><span className="value">{cleanText(c.retiradoPor)}</span></div>

          <div className="sep" />
          <div className="tot big"><span>TOTAL</span><span>$0.00</span></div>
          <p className="muted center">Entrega sin cobro.</p>
          <p className="center" style={{ marginTop: 28 }}>______________________</p>
          <p className="center muted">Recibí conforme</p>
          <p className="center muted">supertiendageek.com</p>
        </article>
      </main>
    </>
  );
}

import { EmisorHeader, TICKET_CSS, type EmisorTicket } from "./ticketShared";
import { cleanText } from "@/components/tecnicos/print/printUtils";
import { fechaCorta } from "@/lib/garantias/plazos";
import type { ComprobanteGarantia } from "@/lib/garantias/comprobante";

// Ticket térmico de 80 mm de la entrega en garantía (auditoría ops, punto 20).
// Mismo estilo que la factura, el recibo y el comprobante de abono.

export function TicketComprobanteGarantia({ emisor, c }: { emisor: EmisorTicket; c: ComprobanteGarantia }) {
  return (
    <>
      <style>{TICKET_CSS}</style>
      <main className="ticket-page">
        <article className="ticket">
          <EmisorHeader emisor={emisor} />
          <div className="center doc-title">Entrega en garantía</div>
          <div className="center doc-num">{c.numero}</div>
          <div className="aviso">DOCUMENTO NO TRIBUTARIO</div>

          <div className="sep" />
          <div className="row"><span className="label">Fecha:</span><span className="value">{fechaCorta(c.fecha)}</span></div>
          <div className="row"><span className="label">Orden:</span><span className="value">{c.orden.codigo}</span></div>
          {c.orden.equipo && <div className="row"><span className="label">Equipo:</span><span className="value">{cleanText(c.orden.equipo)}</span></div>}
          <div className="row"><span className="label">Cliente:</span><span className="value">{cleanText(c.cliente.nombre)}</span></div>
          {c.cliente.identificacion && <div className="row"><span className="label">Ident.:</span><span className="value">{c.cliente.identificacion}</span></div>}

          <div className="sep" />
          {c.lineas.map((l) => (
            <div className="item" key={l.id}>
              <div className="item-desc">{cleanText(l.descripcion)}{l.sku ? ` (${l.sku})` : ""}</div>
              {l.garantiaDe && <div className="muted">Garantía de: {cleanText(l.garantiaDe)}</div>}
              {l.cortesia && <div className="muted">Cortesía de SUPER GEEK</div>}
              <div className="item-calc"><span>Nueva garantía: {l.nuevaGarantia}</span><span>$0.00</span></div>
            </div>
          ))}

          <div className="sep" />
          <div className="tot big"><span>TOTAL</span><span>$0.00</span></div>
          <p className="muted center">{c.entregado ? "Entregado sin costo, como parte de la garantía de SUPER GEEK." : "Constancia previa: la garantía nueva cuenta desde la entrega."}</p>
          <p className="center" style={{ fontWeight: 800, marginTop: 4 }}>Conserve este ticket.</p>
          <p className="center muted">supertiendageek.com</p>
        </article>
      </main>
    </>
  );
}

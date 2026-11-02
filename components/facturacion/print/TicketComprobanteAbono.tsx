import { EmisorHeader, TICKET_CSS, mon, type EmisorTicket } from "./ticketShared";
import { cleanText } from "@/components/tecnicos/print/printUtils";
import { fechaComprobante, type ComprobanteAbono } from "@/lib/cobros/comprobante-abono";

// Ticket térmico de 80 mm del comprobante de abono (orden u operación). Mismo
// estilo que la factura, el recibo y la reserva (ticketShared).

export function TicketComprobanteAbono({ emisor, c }: { emisor: EmisorTicket; c: ComprobanteAbono }) {
  return (
    <>
      <style>{TICKET_CSS}</style>
      <main className="ticket-page">
        <article className="ticket">
          <EmisorHeader emisor={emisor} />
          <div className="center doc-title">Comprobante de abono</div>
          <div className="center doc-num">{c.numero}</div>
          {c.abono.anulado && (
            <div className="aviso-borrador">
              <div className="aviso-borrador-titulo">Anulado</div>
              <div className="aviso-borrador-texto">Este pago fue anulado</div>
            </div>
          )}
          <div className="aviso">DOCUMENTO NO TRIBUTARIO</div>

          <div className="sep" />
          <div className="row"><span className="label">Fecha:</span><span className="value">{fechaComprobante(c.fecha)}</span></div>
          <div className="row"><span className="label">Cuenta:</span><span className="value">{c.referencia}</span></div>
          <div className="row"><span className="label">Cliente:</span><span className="value">{cleanText(c.cliente.nombre)}</span></div>
          {c.cliente.identificacion && <div className="row"><span className="label">Ident.:</span><span className="value">{c.cliente.identificacion}</span></div>}
          {c.cliente.telefono && <div className="row"><span className="label">Teléfono:</span><span className="value">{c.cliente.telefono}</span></div>}

          <div className="sep" />
          <div className="tot big"><span>PAGADO</span><span>{mon(c.abono.monto)}</span></div>
          <div className="row"><span className="label">Forma:</span><span className="value">{c.abono.metodo}</span></div>
          {c.abono.transaccion && <div className="row"><span className="label">Transacción:</span><span className="value">{c.abono.transaccion}</span></div>}
          {c.abono.observacion && <div className="row"><span className="label">Nota:</span><span className="value">{c.abono.observacion}</span></div>}

          {c.cargos.length > 0 && (
            <>
              <div className="sep" />
              {c.cargos.map((g) => (
                <div className="item" key={g.id}>
                  <div className="item-desc">{cleanText(g.nombre)}{g.enEspera ? " (por llegar)" : ""}</div>
                  <div className="item-calc">
                    <span>{g.descuento > 0 ? `${mon(g.precio)} − desc. ${mon(g.descuento)}` : ""}</span>
                    <span>{mon(g.neto)}</span>
                  </div>
                </div>
              ))}
            </>
          )}

          <div className="sep" />
          <div className="tot"><span>Total de la cuenta</span><span>{mon(c.totalCuenta)}</span></div>
          {c.pagos.map((p) => (
            <div className="item-calc" key={p.numero}>
              <span>{fechaComprobante(p.fecha)} · {p.metodo}{p.esEste ? " (este)" : ""}</span>
              <span>{mon(p.monto)}</span>
            </div>
          ))}
          <div className="tot"><span>Total pagado</span><span>{mon(c.totalPagado)}</span></div>
          {c.saldoAFavor > 0
            ? <div className="tot big"><span>SALDO A FAVOR</span><span>{mon(c.saldoAFavor)}</span></div>
            : <div className="tot big"><span>SALDO</span><span>{mon(c.saldoPendiente)}</span></div>}

          <div className="sep" />
          {c.saldoPendiente > 0 && <p className="muted center">Constancia de pago. La factura o el recibo se entrega al completar el pago.</p>}
          <p className="center" style={{ fontWeight: 800, marginTop: 4 }}>Conserve este ticket.</p>
          <p className="thanks">GRACIAS POR SU PAGO</p>
          <p className="center muted">supertiendageek.com</p>
        </article>
      </main>
    </>
  );
}

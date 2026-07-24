import { EmisorHeader, TICKET_CSS, FORMA_PAGO_LABEL, mon, type EmisorTicket } from "./ticketShared";
import type { LineaRecibo } from "@/lib/facturacion/recibos/types";
import { cleanText, formatPrintDate } from "@/components/tecnicos/print/printUtils";

export type TicketReciboData = {
  numero:                string;
  fecha:                 string;
  estado:                string;
  clienteNombre:         string;
  clienteIdentificacion: string;
  total:                 number;
  formaPago:             string;
  nota:                  string;
  lineas:                LineaRecibo[];
};

// Recibo: documento INTERNO no tributario. El precio ya es final (sin desglose
// de IVA), a diferencia de la factura.
export function TicketRecibo({ emisor, recibo }: { emisor: EmisorTicket; recibo: TicketReciboData }) {
  const anulado = recibo.estado === "Anulado";
  return (
    <>
      <style>{TICKET_CSS}</style>
      <main className="ticket-page">
        <article className="ticket">
          <EmisorHeader emisor={emisor} />

          <div className="center doc-title">Recibo</div>
          <div className="center doc-num">{cleanText(recibo.numero)}</div>
          <div className="aviso">DOCUMENTO NO TRIBUTARIO</div>
          {anulado && <div className="aviso">** ANULADO **</div>}

          <div className="sep" />
          <div className="row"><span className="label">Fecha:</span><span className="value">{formatPrintDate(recibo.fecha)}</span></div>
          <div className="row"><span className="label">Cliente:</span><span className="value">{cleanText(recibo.clienteNombre)}</span></div>
          {recibo.clienteIdentificacion && <div className="row"><span className="label">Ident.:</span><span className="value">{recibo.clienteIdentificacion}</span></div>}

          <div className="sep" />
          {recibo.lineas.map((l, i) => {
            const cant = l.cantidad ?? 0, precio = l.precioUnitario ?? 0, desc = l.descuento ?? 0;
            const total = Math.round((cant * precio - desc) * 100) / 100;
            return (
              <div className="item" key={i}>
                {l.codigo && <div className="muted">SKU: {l.codigo}</div>}
                <div className="item-desc">{cleanText(l.descripcion)}</div>
                <div className="item-calc">
                  <span>{cant} x {mon(precio)}{desc > 0 ? ` (-${mon(desc)})` : ""}</span>
                  <span>{mon(total)}</span>
                </div>
              </div>
            );
          })}

          <div className="sep" />
          <div className="tot big"><span>TOTAL</span><span>{mon(recibo.total)}</span></div>
          {recibo.formaPago && (
            <div className="row" style={{ marginTop: 6 }}><span className="label">Pago:</span><span className="value">{FORMA_PAGO_LABEL[recibo.formaPago] ?? recibo.formaPago}</span></div>
          )}
          {recibo.nota && <div className="row"><span className="label">Nota:</span><span className="value">{recibo.nota}</span></div>}

          <div className="sep" />
          <p className="thanks">GRACIAS POR SU COMPRA</p>
          <p className="center muted">supertiendageek.com</p>
        </article>
      </main>
    </>
  );
}

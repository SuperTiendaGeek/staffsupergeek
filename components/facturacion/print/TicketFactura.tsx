import { EmisorHeader, TICKET_CSS, FORMA_PAGO_LABEL, mon, type EmisorTicket } from "./ticketShared";
import type { ItemTicket } from "@/lib/facturacion/print/lineasFactura";
import { cleanText, formatPrintDate } from "@/components/tecnicos/print/printUtils";

export type TicketFacturaData = {
  numeroFactura:        string;
  fechaEmision:         string;
  clienteNombre:        string;
  clienteIdentificacion:string;
  subtotal:             number;
  iva:                  number;
  total:                number;
  items:                ItemTicket[];
  formaPago:            string;
  claveAcceso:          string;
  numeroAutorizacion:   string;
  fechaAutorizacion:    string;
  ambiente:             string;   // "PRUEBAS" | "PRODUCCIÓN"
};

export function TicketFactura({ emisor, factura }: { emisor: EmisorTicket; factura: TicketFacturaData }) {
  const esPrueba = factura.ambiente === "PRUEBAS";
  return (
    <>
      <style>{TICKET_CSS}</style>
      <main className="ticket-page">
        <article className="ticket">
          <EmisorHeader emisor={emisor} />

          <div className="center doc-title">Factura</div>
          <div className="center doc-num">{cleanText(factura.numeroFactura)}</div>

          {esPrueba && <div className="aviso">DOCUMENTO DE PRUEBA — SIN VALIDEZ TRIBUTARIA</div>}

          <div className="sep" />
          <div className="row"><span className="label">Fecha:</span><span className="value">{formatPrintDate(factura.fechaEmision)}</span></div>
          <div className="row"><span className="label">Cliente:</span><span className="value">{cleanText(factura.clienteNombre)}</span></div>
          <div className="row"><span className="label">Ident.:</span><span className="value">{cleanText(factura.clienteIdentificacion)}</span></div>

          <div className="sep" />
          {factura.items.map((it, i) => (
            <div className="item" key={i}>
              {it.codigo && <div className="muted">SKU: {it.codigo}</div>}
              <div className="item-desc">{cleanText(it.descripcion)}</div>
              <div className="item-calc">
                <span>{it.cantidad} x {mon(it.precioUnitario)}{it.descuento > 0 ? ` (-${mon(it.descuento)})` : ""}</span>
                <span>{mon(it.total)}</span>
              </div>
            </div>
          ))}

          <div className="sep" />
          <div className="tot"><span>Subtotal</span><span>{mon(factura.subtotal)}</span></div>
          <div className="tot"><span>IVA</span><span>{mon(factura.iva)}</span></div>
          <div className="tot big"><span>TOTAL</span><span>{mon(factura.total)}</span></div>
          {factura.formaPago && (
            <div className="row" style={{ marginTop: 6 }}><span className="label">Pago:</span><span className="value">{FORMA_PAGO_LABEL[factura.formaPago] ?? factura.formaPago}</span></div>
          )}

          {factura.numeroAutorizacion && (
            <>
              <div className="sep" />
              <div className="sri">
                <div><span className="k">Autorización SRI:</span><br />{factura.numeroAutorizacion}</div>
                <div style={{ marginTop: 3 }}><span className="k">Clave de acceso:</span><br />{factura.claveAcceso}</div>
                {factura.fechaAutorizacion && <div style={{ marginTop: 3 }}><span className="k">Fecha aut.:</span> {formatPrintDate(factura.fechaAutorizacion)}</div>}
                <div style={{ marginTop: 3 }}><span className="k">Ambiente:</span> {factura.ambiente}</div>
              </div>
            </>
          )}

          <div className="sep" />
          <p className="thanks">GRACIAS POR SU COMPRA</p>
          <p className="center muted">supertiendageek.com</p>
        </article>
      </main>
    </>
  );
}

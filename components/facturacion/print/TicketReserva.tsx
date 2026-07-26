import { EmisorHeader, TICKET_CSS, FORMA_PAGO_LABEL, mon, type EmisorTicket } from "./ticketShared";
import { cleanText } from "@/components/tecnicos/print/printUtils";

// Dos tickets térmicos de 80 mm impresos en una sola pasada:
//   1) Constancia para el cliente (se le entrega o se envía el PDF por WhatsApp).
//   2) Etiqueta para pegar en el ítem y llevarlo a la estantería de reservas.
// Ambos con toda la info para entender la transacción.

export type AbonoTicket = { monto: number; fecha: string; formaPago: string };

export type TicketReservaData = {
  numero:                string;
  fecha:                 string;   // "YYYY-MM-DD"
  fechaLimite:           string;   // "YYYY-MM-DD"
  plazoDias:             number;
  clienteNombre:         string;
  clienteIdentificacion: string;
  clienteTelefono:       string;
  descripcionItem:       string;
  precio:                number;
  totalAbonado:          number;
  abonos:                AbonoTicket[];
};

const fmt = (iso: string) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

export function TicketReserva({ emisor, reserva }: { emisor: EmisorTicket; reserva: TicketReservaData }) {
  const saldo = Math.max(0, Math.round((reserva.precio - reserva.totalAbonado) * 100) / 100);

  return (
    <>
      <style>{TICKET_CSS}</style>
      <main className="ticket-page">

        {/* ── Ticket 1: constancia del cliente ── */}
        <article className="ticket">
          <EmisorHeader emisor={emisor} />
          <div className="center doc-title">Reserva</div>
          <div className="center doc-num">{cleanText(reserva.numero)}</div>
          <div className="aviso">COMPROBANTE DE RESERVA — DOCUMENTO NO TRIBUTARIO</div>

          <div className="sep" />
          <div className="row"><span className="label">Fecha:</span><span className="value">{fmt(reserva.fecha)}</span></div>
          <div className="row"><span className="label">Cliente:</span><span className="value">{cleanText(reserva.clienteNombre)}</span></div>
          {reserva.clienteIdentificacion && <div className="row"><span className="label">Ident.:</span><span className="value">{reserva.clienteIdentificacion}</span></div>}
          {reserva.clienteTelefono && <div className="row"><span className="label">Teléfono:</span><span className="value">{reserva.clienteTelefono}</span></div>}

          <div className="sep" />
          <div className="item"><div className="item-desc">{cleanText(reserva.descripcionItem)}</div></div>
          <div className="tot"><span>Precio</span><span>{mon(reserva.precio)}</span></div>

          <div className="sep" />
          {reserva.abonos.map((a, i) => (
            <div className="item-calc" key={i}>
              <span>{fmt(a.fecha)} · {FORMA_PAGO_LABEL[a.formaPago] ?? a.formaPago}</span>
              <span>{mon(a.monto)}</span>
            </div>
          ))}
          <div className="tot"><span>Total abonado</span><span>{mon(reserva.totalAbonado)}</span></div>
          <div className="tot big"><span>SALDO</span><span>{mon(saldo)}</span></div>

          <div className="sep" />
          <div className="aviso">VÁLIDA HASTA: {fmt(reserva.fechaLimite)} ({reserva.plazoDias} días)</div>
          <p className="muted center">Si no se completa el pago en el plazo, el ítem vuelve a estar disponible y lo abonado queda como saldo a favor.</p>
          <p className="thanks">GRACIAS POR SU COMPRA</p>
          <p className="center muted">supertiendageek.com</p>
        </article>

        {/* Corte entre tickets */}
        <div className="corte">✂ - - - - - - - - - - - - - - - - - - - - - - - - -</div>

        {/* ── Ticket 2: etiqueta para el ítem (estantería de reservas) ── */}
        <article className="ticket">
          <div className="etq">RESERVADO</div>
          <div className="center doc-num">{cleanText(reserva.numero)}</div>
          <div className="sep" />
          <div className="row"><span className="label">Cliente:</span><span className="value">{cleanText(reserva.clienteNombre)}</span></div>
          {reserva.clienteTelefono && <div className="row"><span className="label">Teléfono:</span><span className="value">{reserva.clienteTelefono}</span></div>}
          <div className="sep" />
          <div className="item"><div className="item-desc">{cleanText(reserva.descripcionItem)}</div></div>
          <div className="sep" />
          <div className="aviso">GUARDAR HASTA: {fmt(reserva.fechaLimite)}</div>
          <div className="tot big"><span>SALDO</span><span>{mon(saldo)}</span></div>
          <p className="muted center">No vender — apartado. Reservado el {fmt(reserva.fecha)}.</p>
        </article>

      </main>
      <style>{`
        .corte { text-align:center; font-size:10px; color:#000; margin:6px 0; letter-spacing:1px; }
        .etq { text-align:center; font-size:22px; font-weight:900; letter-spacing:0.08em; margin-top:4px; }
        @media print { .corte { page-break-after: always; } }
      `}</style>
    </>
  );
}

import type { AbonoPorOrden } from "@/types/tecnicos";
import type { OrdenDetalle } from "@/lib/tecnicos/airtable";
import type { CuentaUnificada } from "@/types/cuenta-unificada";
import { cleanText, formatMoney, formatPrintDate } from "./printUtils";

type TicketAbonoProps = {
  orden: OrdenDetalle;
  abono: AbonoPorOrden;
  cuentaUnificada: CuentaUnificada | null;
};

export function TicketAbono({ orden, abono, cuentaUnificada }: TicketAbonoProps) {
  const totalAPagar = cuentaUnificada?.totalCuenta ?? orden.totalAPagarNV;
  const totalAbonado = cuentaUnificada?.totalAbonado ?? orden.totalAbonadoNV;
  const saldoPendiente = cuentaUnificada ? Math.max(0, cuentaUnificada.saldo) : orden.saldoNV;
  return (
    <>
      <style>{`
        html,
        body {
          margin: 0;
          padding: 0;
          background: #fff;
          color: #000;
          font-family: Arial, Helvetica, sans-serif;
        }

        @page {
          size: 80mm auto;
          margin: 0;
        }

        .ticket-page {
          min-height: 100vh;
          background: #fff;
          color: #000;
        }

        .ticket {
          width: 72mm;
          margin: 0 auto;
          padding: 4mm 2mm 6mm;
          box-sizing: border-box;
          font-size: 11px;
          line-height: 1.25;
        }

        .center { text-align: center; }
        .brand { font-size: 18px; font-weight: 800; letter-spacing: 0.04em; }
        .title { margin-top: 8px; font-size: 13px; font-weight: 800; text-transform: uppercase; }
        .sep { border-top: 1px dashed #000; margin: 8px 0; }
        .row { display: flex; gap: 4px; margin: 4px 0; }
        .label { min-width: 30mm; font-weight: 800; }
        .value { flex: 1; text-align: right; word-break: break-word; }
        .amount { font-size: 18px; font-weight: 900; }
        .thanks { margin-top: 10px; font-size: 12px; font-weight: 900; text-align: center; }
        .print-actions {
          display: flex;
          justify-content: center;
          gap: 8px;
          padding: 14px;
          background: #f3f3f3;
        }
        .print-actions button,
        .print-actions a {
          border: 1px solid #111;
          border-radius: 6px;
          background: #fff;
          color: #111;
          padding: 8px 12px;
          font: 700 13px Arial, Helvetica, sans-serif;
          text-decoration: none;
          cursor: pointer;
        }

        @media print {
          .print-actions { display: none !important; }
          .ticket { margin: 0; }
        }
      `}</style>
      <main className="ticket-page">
        <article className="ticket">
          <header className="center">
            <div className="brand">SUPER GEEK</div>
            <div className="title">Comprobante de abono</div>
          </header>

          <div className="sep" />
          <div className="row">
            <span className="label">Orden:</span>
            <span className="value">{cleanText(orden.idVisible, orden.recordId)}</span>
          </div>
          <div className="row">
            <span className="label">Cliente:</span>
            <span className="value">{cleanText(orden.clienteNombre)}</span>
          </div>
          <div className="row">
            <span className="label">Fecha abono:</span>
            <span className="value">{formatPrintDate(abono.fecha)}</span>
          </div>
          <div className="row">
            <span className="label">Metodo pago:</span>
            <span className="value">{cleanText(abono.metodoPago, "No disponible")}</span>
          </div>
          <div className="sep" />
          <div className="row amount">
            <span className="label">Abono:</span>
            <span className="value">{formatMoney(abono.monto)}</span>
          </div>
          <div className="row">
            <span className="label">Total a pagar:</span>
            <span className="value">{formatMoney(totalAPagar)}</span>
          </div>
          <div className="row">
            <span className="label">Total abonado:</span>
            <span className="value">{formatMoney(totalAbonado)}</span>
          </div>
          <div className="row">
            <span className="label">Saldo pendiente:</span>
            <span className="value">{formatMoney(saldoPendiente)}</span>
          </div>
          {cuentaUnificada && cuentaUnificada.saldo < 0 && (
            <div className="row">
              <span className="label">Saldo a favor:</span>
              <span className="value">{formatMoney(Math.abs(cuentaUnificada.saldo))}</span>
            </div>
          )}
          {abono.observacion && (
            <>
              <div className="sep" />
              <div className="row">
                <span className="label">Obs:</span>
                <span className="value">{abono.observacion}</span>
              </div>
            </>
          )}
          <div className="sep" />
          <p className="thanks">Gracias por su abono</p>
        </article>
      </main>
    </>
  );
}

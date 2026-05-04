import type { OrdenDetalle } from "@/lib/tecnicos/airtable";
import { cleanText, formatPrintDate } from "./printUtils";

type TicketOrdenProps = {
  orden: OrdenDetalle;
};

const condiciones = [
  "El cliente autoriza a SUPER GEEK a revisar, diagnosticar y reparar el equipo.",
  "SUPER GEEK no se hace responsable por perdida de datos ni fallos adicionales que aparezcan durante diagnostico o reparacion.",
  "Los tiempos de entrega son estimados y pueden variar segun disponibilidad de repuestos y complejidad del dano.",
  "Si el equipo no es retirado dentro de 90 dias desde la notificacion, SUPER GEEK podra disponer del mismo o de sus partes para cubrir costos de almacenamiento y revision.",
  "La garantia aplica solo sobre el componente o servicio reemplazado, no sobre el funcionamiento total del equipo.",
  "No cubre danos por liquidos, golpes, mal uso o manipulacion externa.",
  "El retiro del equipo implica aceptacion y conformidad con el servicio realizado.",
];

export function TicketOrden({ orden }: TicketOrdenProps) {
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
        .order-id { margin: 8px 0; font-size: 22px; font-weight: 900; text-align: center; }
        .sep { border-top: 1px dashed #000; margin: 8px 0; }
        .row { display: flex; gap: 4px; margin: 3px 0; }
        .label { min-width: 25mm; font-weight: 800; }
        .value { flex: 1; word-break: break-word; }
        .conditions-title { margin-top: 10px; font-size: 11px; font-weight: 900; text-align: center; }
        ol { margin: 6px 0 0 15px; padding: 0; }
        li { margin: 4px 0; }
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
            <div>Direccion: C. Vicente Ramon Roca y C. Cristobal Colon</div>
            <div>Telefono: 0968808149 - 065005244</div>
            <div className="title">Orden de Reparacion</div>
          </header>

          <div className="order-id">{cleanText(orden.idVisible, orden.recordId)}</div>
          <div className="sep" />

          <div className="row">
            <span className="label">Fecha:</span>
            <span className="value">{formatPrintDate(orden.fechaIngreso)}</span>
          </div>
          <div className="row">
            <span className="label">Cliente:</span>
            <span className="value">{cleanText(orden.clienteNombre)}</span>
          </div>
          <div className="row">
            <span className="label">Telefono:</span>
            <span className="value">{cleanText(orden.telefono)}</span>
          </div>
          <div className="row">
            <span className="label">Cedula:</span>
            <span className="value">{cleanText(orden.cedula)}</span>
          </div>
          <div className="row">
            <span className="label">Equipo:</span>
            <span className="value">{cleanText(orden.equipo)}</span>
          </div>
          <div className="row">
            <span className="label">Accesorios:</span>
            <span className="value">{cleanText(orden.accesorios, "Sin accesorios")}</span>
          </div>
          <div className="row">
            <span className="label">Falla / Ingresa:</span>
            <span className="value">{cleanText(orden.ingresaPor)}</span>
          </div>

          <div className="sep" />
          <p className="center">
            Para mas informacion sobre garantias visite supertiendageek.com
          </p>
          <div className="conditions-title">CONDICIONES DEL SERVICIO - SUPER GEEK</div>
          <ol>
            {condiciones.map((condicion) => (
              <li key={condicion}>{condicion}</li>
            ))}
          </ol>
          <div className="sep" />
          <p className="thanks">GRACIAS POR CONFIAR EN SUPER GEEK</p>
        </article>
      </main>
    </>
  );
}

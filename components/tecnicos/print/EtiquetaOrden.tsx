import type { OrdenDetalle } from "@/lib/tecnicos/airtable";
import { cleanText, formatShortDate } from "./printUtils";

type EtiquetaOrdenProps = {
  orden: OrdenDetalle;
};

export function EtiquetaOrden({ orden }: EtiquetaOrdenProps) {
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
          size: 50mm 25mm;
          margin: 0;
        }

        .label-page {
          min-height: 100vh;
          background: #fff;
          color: #000;
        }

        .label {
          width: 50mm;
          height: 25mm;
          box-sizing: border-box;
          padding: 2mm;
          overflow: hidden;
          font-size: 8.5px;
          line-height: 1.08;
        }

        .top,
        .meta {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 2mm;
          white-space: nowrap;
        }

        .brand,
        .order {
          font-weight: 900;
          font-size: 10px;
        }

        .line {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-weight: 700;
          margin-top: 1.2mm;
        }

        .equipment {
          font-size: 8px;
        }

        .status {
          max-width: 25mm;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .big {
          margin-top: 1.2mm;
          font-size: 17px;
          line-height: 1;
          font-weight: 900;
          letter-spacing: 0.02em;
        }

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
        }
      `}</style>
      <main className="label-page">
        <article className="label">
          <div className="top">
            <span className="brand">SUPER GEEK</span>
            <span className="order">{cleanText(orden.idVisible, orden.recordId)}</span>
          </div>
          <div className="line">{cleanText(orden.clienteNombre)}</div>
          <div className="line equipment">{cleanText(orden.equipo)}</div>
          <div className="meta line">
            <span>{formatShortDate(orden.fechaIngreso)}</span>
            <span className="status">{cleanText(orden.estadoActual)}</span>
          </div>
          <div className="big">EQUIPO</div>
        </article>
      </main>
    </>
  );
}

import type { OrdenDetalle } from "@/lib/tecnicos/airtable";
import { cleanText, formatShortDate } from "./printUtils";

type EtiquetaOrdenProps = {
  orden: OrdenDetalle;
};

export function EtiquetaOrden({ orden }: EtiquetaOrdenProps) {
  // Mostrar accesorios solo si hay un valor real (no el default "No disponible")
  const accesorios = orden.accesorios?.trim();
  const tieneAccesorios =
    !!accesorios &&
    accesorios.toLowerCase() !== "no disponible" &&
    accesorios !== "-";

  return (
    <>
      <style>{`
        html, body {
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

        /* Contenedor pantalla: centra la etiqueta para previsualización */
        .label-page {
          min-height: 100vh;
          background: #fff;
          color: #000;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
        }

        /* La etiqueta física: 50 × 25 mm exactos */
        .label {
          width: 50mm;
          height: 25mm;
          box-sizing: border-box;
          padding: 1.2mm 1.5mm 1mm 1.5mm;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        /* ── Cabecera: marca izquierda, fecha derecha ── */
        .label-header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          font-size: 5.5pt;
          font-weight: 700;
          line-height: 1;
          border-bottom: 0.25mm solid #000;
          padding-bottom: 0.4mm;
          margin-bottom: 0.3mm;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .label-brand {
          letter-spacing: 0.03em;
        }

        .label-date {
          font-weight: 400;
        }

        /* ── Número de orden: protagonista ── */
        .label-order {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20pt;
          font-weight: 900;
          line-height: 1;
          letter-spacing: -0.01em;
          text-align: center;
          overflow: hidden;
          white-space: nowrap;
        }

        /* ── Pie: cliente, equipo, accesorios ── */
        .label-footer {
          flex-shrink: 0;
          border-top: 0.25mm solid #000;
          padding-top: 0.4mm;
          font-size: 5.5pt;
          line-height: 1.15;
        }

        .label-row {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .label-row-client {
          font-weight: 700;
          font-size: 6pt;
        }

        .label-row-equip {
          font-weight: 400;
        }

        .label-row-acc {
          font-weight: 400;
          font-size: 5pt;
        }

        /* ── Botones de acción (solo en pantalla) ── */
        .print-actions {
          display: flex;
          justify-content: center;
          gap: 8px;
          padding: 14px;
          background: #f3f3f3;
          width: 100%;
          box-sizing: border-box;
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
          .label-page { min-height: unset; }
        }
      `}</style>

      <main className="label-page">
        <article className="label">

          {/* Cabecera */}
          <div className="label-header">
            <span className="label-brand">SUPER GEEK</span>
            <span className="label-date">{formatShortDate(orden.fechaIngreso)}</span>
          </div>

          {/* Número de orden — elemento principal */}
          <div className="label-order">
            {cleanText(orden.idVisible, orden.recordId)}
          </div>

          {/* Pie con datos secundarios */}
          <div className="label-footer">
            <div className="label-row label-row-client">
              {cleanText(orden.clienteNombre)}
            </div>
            <div className="label-row label-row-equip">
              {cleanText(orden.equipo)}
            </div>
            {tieneAccesorios && (
              <div className="label-row label-row-acc">
                Acc: {accesorios}
              </div>
            )}
          </div>

        </article>
      </main>
    </>
  );
}

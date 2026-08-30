// Etiqueta de "Próximo mantenimiento" — mismo tamaño físico (50 × 25 mm) que
// EtiquetaOrden (components/tecnicos/print/EtiquetaOrden.tsx), pero genérica
// a propósito: no lleva cliente ni equipo, así que sirve igual desde una
// orden de reparación concreta (/tecnicos/ordenes/[id]) que desde el modal
// de creación de documentos en /facturacion, donde no siempre hay una orden
// de por medio.
//
// El único dato variable es la fecha — todo lo demás es marca y contacto,
// igual en cada impresión.

type EtiquetaMantenimientoProps = {
  fecha: Date;
};

const TELEFONO_CONTACTO = "0968808149";

function formatFechaEtiqueta(fecha: Date): string {
  const dd = String(fecha.getDate()).padStart(2, "0");
  const mm = String(fecha.getMonth() + 1).padStart(2, "0");
  const yy = String(fecha.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

export function EtiquetaMantenimiento({ fecha }: EtiquetaMantenimientoProps) {
  return (
    <>
      <style>{`
        .etiqueta-mantenimiento-page {
          margin: 0;
          padding: 0;
        }

        @page {
          size: 50mm 25mm;
          margin: 0;
        }

        /* La etiqueta física: 50 × 25 mm exactos — igual que EtiquetaOrden */
        .etiqueta-mantenimiento {
          width: 50mm;
          height: 25mm;
          box-sizing: border-box;
          padding: 1.4mm 1.8mm;
          overflow: hidden;
          background: #fff;
          color: #000;
          font-family: Arial, Helvetica, sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          text-align: center;
        }

        .etiqueta-mantenimiento-marca {
          font-size: 6.5pt;
          font-weight: 900;
          letter-spacing: 0.06em;
          line-height: 1;
          border-bottom: 0.3mm solid #000;
          padding-bottom: 0.5mm;
          width: 100%;
        }

        .etiqueta-mantenimiento-titulo {
          font-size: 5.5pt;
          font-weight: 700;
          letter-spacing: 0.03em;
          line-height: 1.1;
          margin-top: 0.6mm;
        }

        .etiqueta-mantenimiento-fecha {
          font-size: 19pt;
          font-weight: 900;
          line-height: 1;
          letter-spacing: 0.02em;
        }

        .etiqueta-mantenimiento-footer {
          width: 100%;
          border-top: 0.3mm solid #000;
          padding-top: 0.5mm;
          font-size: 5.5pt;
          line-height: 1.15;
        }

        .etiqueta-mantenimiento-cta {
          font-weight: 400;
        }

        .etiqueta-mantenimiento-telefono {
          font-weight: 900;
          font-size: 6.5pt;
        }
      `}</style>

      <div className="etiqueta-mantenimiento-page">
        <article className="etiqueta-mantenimiento">
          <div className="etiqueta-mantenimiento-marca">SUPER GEEK</div>

          <div className="etiqueta-mantenimiento-titulo">PRÓXIMO MANTENIMIENTO</div>

          <div className="etiqueta-mantenimiento-fecha">{formatFechaEtiqueta(fecha)}</div>

          <div className="etiqueta-mantenimiento-footer">
            <div className="etiqueta-mantenimiento-cta">Agenda tu cita</div>
            <div className="etiqueta-mantenimiento-telefono">{TELEFONO_CONTACTO}</div>
          </div>
        </article>
      </div>
    </>
  );
}

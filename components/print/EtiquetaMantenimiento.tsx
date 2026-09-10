// Etiqueta de "Próximo mantenimiento" — mismo tamaño físico (50 × 25 mm) que
// EtiquetaOrden (components/tecnicos/print/EtiquetaOrden.tsx). Es compartida
// por /tecnicos/ordenes/[id] y por el detalle de factura en /facturacion.
//
// Por pedido de operación, la impresión lleva solo tres datos: título, fecha
// ingresada por el usuario y teléfono de contacto.

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
        @page {
          size: 50mm 25mm;
          margin: 0;
        }

        /* La etiqueta física: 50 × 25 mm exactos — igual que EtiquetaOrden */
        .etiqueta-mantenimiento {
          width: 50mm;
          height: 25mm;
          box-sizing: border-box;
          overflow: hidden;
          background: #fff;
          color: #000;
          font-family: Arial, Helvetica, sans-serif;
          padding: 2.2mm 2mm 1.8mm;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          text-align: center;
        }

        .etiqueta-mantenimiento-contenido {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
        }

        .etiqueta-mantenimiento-titulo {
          width: 100%;
          border: 1.4pt solid #000;
          padding: 1mm 0.8mm;
          box-sizing: border-box;
          font-size: 8pt;
          font-weight: 900;
          letter-spacing: 0.02em;
          line-height: 1;
        }

        .etiqueta-mantenimiento-fecha {
          font-size: 24pt;
          font-weight: 900;
          line-height: 1;
          letter-spacing: 0;
        }

        .etiqueta-mantenimiento-telefono {
          font-weight: 900;
          font-size: 8.5pt;
          line-height: 1;
          letter-spacing: 0;
        }
      `}</style>

      <article className="etiqueta-mantenimiento">
        <div className="etiqueta-mantenimiento-contenido">
          <div className="etiqueta-mantenimiento-titulo">PRÓXIMO MANTENIMIENTO</div>
          <div className="etiqueta-mantenimiento-fecha">{formatFechaEtiqueta(fecha)}</div>
          <div className="etiqueta-mantenimiento-telefono">Contactanos {TELEFONO_CONTACTO}</div>
        </div>
      </article>
    </>
  );
}

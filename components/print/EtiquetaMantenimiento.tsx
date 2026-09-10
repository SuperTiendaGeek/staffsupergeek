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
          padding: 1.4mm;
          display: block;
          text-align: center;
        }

        .etiqueta-mantenimiento-contenido {
          width: 100%;
          height: 100%;
          box-sizing: border-box;
          border: 1.35pt solid #000;
          display: grid;
          grid-template-rows: 5.6mm 1fr 5.2mm;
          background:
            linear-gradient(#000, #000) left 1.2mm bottom 5.2mm / calc(100% - 2.4mm) 0.7pt no-repeat,
            #fff;
        }

        .etiqueta-mantenimiento-titulo {
          width: 100%;
          box-sizing: border-box;
          background: #000;
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 1mm;
          font-size: 7.7pt;
          font-weight: 900;
          letter-spacing: 0;
          line-height: 1;
        }

        .etiqueta-mantenimiento-fecha-fila {
          min-width: 0;
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          gap: 1.2mm;
          align-items: center;
          padding: 0 2.2mm;
          box-sizing: border-box;
        }

        .etiqueta-mantenimiento-fecha-fila::before,
        .etiqueta-mantenimiento-fecha-fila::after {
          content: "";
          display: block;
          border-top: 1.2pt solid #000;
        }

        .etiqueta-mantenimiento-fecha {
          font-size: 22pt;
          font-weight: 900;
          line-height: 0.9;
          letter-spacing: 0;
          white-space: nowrap;
        }

        .etiqueta-mantenimiento-telefono {
          display: flex;
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
          padding: 0 1mm;
          font-weight: 900;
          font-size: 7.8pt;
          line-height: 1;
          letter-spacing: 0;
          text-transform: uppercase;
          white-space: nowrap;
        }
      `}</style>

      <article className="etiqueta-mantenimiento">
        <div className="etiqueta-mantenimiento-contenido">
          <div className="etiqueta-mantenimiento-titulo">PRÓXIMO MANTENIMIENTO</div>
          <div className="etiqueta-mantenimiento-fecha-fila">
            <div className="etiqueta-mantenimiento-fecha">{formatFechaEtiqueta(fecha)}</div>
          </div>
          <div className="etiqueta-mantenimiento-telefono">Contáctanos {TELEFONO_CONTACTO}</div>
        </div>
      </article>
    </>
  );
}

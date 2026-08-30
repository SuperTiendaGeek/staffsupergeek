// Etiqueta de "Próximo mantenimiento" — mismo tamaño físico (50 × 25 mm) que
// EtiquetaOrden (components/tecnicos/print/EtiquetaOrden.tsx), pero genérica
// a propósito: no lleva cliente ni equipo, así que sirve igual desde una
// orden de reparación concreta (/tecnicos/ordenes/[id]) que desde el modal
// de detalle de una factura emitida en /facturacion.
//
// El único dato variable es la fecha — todo lo demás es marca y contacto,
// igual en cada impresión.
//
// v2: a 50×25mm real, cualquier línea de texto de más compite por el mismo
// espacio diminuto — cuantas más líneas pequeñas, menos legible se ve de
// lejos (que es justo para lo que sirve esta etiqueta, pegada en la
// carcasa del equipo). Se bajó de 5 líneas de texto a 3 bloques: un
// recuadro de marca sólido (más fácil de reconocer de un vistazo que texto
// chico), la fecha como único protagonista, y el teléfono como cierre.

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
          display: flex;
          flex-direction: row;
        }

        /* Bloque de marca — sólido en negro, se reconoce de un vistazo sin
           tener que leer letra chica. */
        .etiqueta-mantenimiento-marca {
          flex: 0 0 14mm;
          background: #000;
          color: #fff;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          line-height: 1.05;
          font-weight: 900;
          letter-spacing: 0.02em;
          font-size: 8pt;
        }

        .etiqueta-mantenimiento-contenido {
          flex: 1;
          min-width: 0;
          box-sizing: border-box;
          padding: 1.2mm 1.8mm 1mm;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          gap: 0.4mm;
        }

        .etiqueta-mantenimiento-titulo {
          font-size: 6pt;
          font-weight: 700;
          letter-spacing: 0.03em;
          line-height: 1;
        }

        .etiqueta-mantenimiento-fecha {
          font-size: 23pt;
          font-weight: 900;
          line-height: 1;
          letter-spacing: 0.01em;
        }

        .etiqueta-mantenimiento-telefono {
          font-weight: 900;
          font-size: 9pt;
          line-height: 1;
        }
      `}</style>

      <article className="etiqueta-mantenimiento">
        <div className="etiqueta-mantenimiento-marca">
          <span>SUPER</span>
          <span>GEEK</span>
        </div>

        <div className="etiqueta-mantenimiento-contenido">
          <div className="etiqueta-mantenimiento-titulo">PRÓXIMO MANTENIMIENTO</div>
          <div className="etiqueta-mantenimiento-fecha">{formatFechaEtiqueta(fecha)}</div>
          <div className="etiqueta-mantenimiento-telefono">{TELEFONO_CONTACTO}</div>
        </div>
      </article>
    </>
  );
}

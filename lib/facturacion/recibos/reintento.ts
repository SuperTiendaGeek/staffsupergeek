// Reintentar el descargo de inventario de un recibo (punto 10a de la
// auditoría Shipping V2, resto de C-9 · decisión 7 del dueño, 16-oct-2026).
//
// Las facturas ya tienen "Reintentar sincronización" desde el 7-oct. Los
// recibos no: si al emitir fallaba el descuento (Airtable caído, límite de
// peticiones), el error quedaba guardado en el recibo pero nadie lo veía y no
// había cómo repetirlo.
//
// Protección contra el doble descuento (lo pidió el dueño), en tres capas:
// 1. Esta regla: solo se reintenta un recibo Vigente cuyo descargo quedó en
//    ERROR o PENDIENTE; si quedó PENDIENTE hace menos de 2 minutos, la emisión
//    puede seguir en curso y se pide esperar.
// 2. Un turno por recibo en el servidor (withLock): un doble clic no corre dos
//    veces a la vez.
// 3. La marca de hecho por artículo: descontarInventarioRecibo escribe la
//    Cantidad y el vínculo "Recibo" del artículo en la MISMA escritura, y salta
//    todo artículo que ya tenga este recibo vinculado. Un artículo que ya se
//    descontó nunca se vuelve a descontar.

export const VENTANA_RECIBO_EN_CURSO_MS = 2 * 60 * 1000;

export type PlanReintentoRecibo =
  | { accion: "reintentar" }
  | { accion: "nada"; motivo: string }
  | { accion: "esperar"; motivo: string };

export function planReintentoInventarioRecibo(r: {
  estado: string;
  sincronizacionInventario: string;
  /** Momento en que se creó el recibo (createdTime de Airtable). */
  creadoEn?: string;
  ahora?: Date;
}): PlanReintentoRecibo {
  if (r.estado !== "Vigente") return { accion: "nada", motivo: `El recibo está ${r.estado || "sin estado"}; no se toca el inventario.` };
  const sync = (r.sincronizacionInventario || "").toUpperCase();
  if (sync === "OK") return { accion: "nada", motivo: "El inventario de este recibo ya está descontado." };
  if (sync !== "ERROR" && sync !== "PENDIENTE") {
    return { accion: "nada", motivo: "Este recibo no tiene un descargo pendiente." };
  }
  if (sync === "PENDIENTE" && r.creadoEn) {
    const t = Date.parse(r.creadoEn);
    const ahora = (r.ahora ?? new Date()).getTime();
    if (Number.isFinite(t) && ahora - t >= 0 && ahora - t < VENTANA_RECIBO_EN_CURSO_MS) {
      return { accion: "esperar", motivo: "El recibo se está emitiendo. Espera unos 2 minutos y vuelve a intentarlo." };
    }
  }
  return { accion: "reintentar" };
}

/** ¿La fila del historial debe mostrar el aviso con el botón Reintentar? */
export function reciboRequiereAtencionInventario(r: { estado: string; sincronizacionInventario?: string }): boolean {
  const sync = (r.sincronizacionInventario || "").toUpperCase();
  return r.estado === "Vigente" && (sync === "ERROR" || sync === "PENDIENTE");
}

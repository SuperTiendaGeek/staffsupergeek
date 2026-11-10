// Punto 10A-0 (10-nov-2026) — terminar de separar las órdenes de reparación de
// Operaciones Comerciales. Regla PURA, con prueba.
//
// Decisión del dueño (Fase 2, 1-nov; confirmada el 10-nov): el repuesto bajo
// pedido de una orden se compra y viaja por Shipping V2 y su dinero vive SOLO
// en la cuenta de la orden; Operaciones queda para pedidos de clientes que no
// son reparaciones. Quedaban operaciones del flujo viejo enganchadas a órdenes
// (OR000491, 507, 514, 522, 530): aparecían en el tablero con dinero.
//
// Para cada una:
//   · sus abonos quedan solo en la orden (ya estaban enlazados a ella; si
//     alguno NO lo está, se bloquea: no se mueve dinero);
//   · su artículo pasa a estar apartado para la orden ("Orden de Reparación
//     (Stock)") y deja de colgar de la operación;
//   · su línea del presupuesto deja de apuntar a la operación (sigue Cargada
//     con el mismo artículo);
//   · su solicitud de compra pasa a la orden y a la línea (como una de la Fase 2);
//   · la operación se cierra ("Cancelado") con una nota y sin orden.
// La cuenta de cada orden NO cambia: el script la compara antes y después.

export const NOTA_SEPARACION = (orden: string) =>
  `Pasó a la orden ${orden} (separación orden/pedidos, punto 10A-0, 10-nov-2026).`;

const CERRADAS = new Set(["Entregado", "Rechazado", "Cancelado"]);

export type OpParaSeparar = {
  id: string;
  codigo: string;
  estado: string;
  ordenId: string | null;
  ordenCodigo: string;
  itemIds: string[];
  lineaIds: string[];
  abonoIds: string[];
  solicitudIds: string[];
  /** Recibos o facturas emitidos desde la operación: no se toca a ciegas. */
  documentos: number;
  observacion: string;
};
export type LineaParaSeparar = { id: string; ordenId: string | null; operacionId: string | null; itemId: string | null; estado: string };
export type ItemParaSeparar = { id: string; sku: string; operacionIds: string[]; ordenStockIds: string[] };
export type AbonoParaSeparar = { id: string; numero: string; monto: number; ordenIds: string[]; operacionIds: string[] };
export type SolicitudParaSeparar = { id: string; codigo: string; operacionId: string | null; ordenId: string | null; lineaId: string | null };

export type AccionSeparar =
  | { tipo: "abono_solo_orden"; id: string; op: string; numero: string; monto: number; operacionIds: string[] }
  | { tipo: "item_a_orden"; id: string; op: string; sku: string; ordenId: string; operacionIds: string[]; ordenStockIds: string[] }
  | { tipo: "linea_sin_op"; id: string; op: string }
  | { tipo: "solicitud_a_orden"; id: string; op: string; codigo: string; ordenId: string; lineaId: string }
  | { tipo: "cerrar_op"; id: string; op: string; orden: string; observacion: string };

export type BloqueoSeparar = { op: string; motivo: string };

export function planSeparacion(input: {
  operaciones: readonly OpParaSeparar[];
  lineas: readonly LineaParaSeparar[];
  items: readonly ItemParaSeparar[];
  abonos: readonly AbonoParaSeparar[];
  solicitudes: readonly SolicitudParaSeparar[];
}): { acciones: AccionSeparar[]; bloqueos: BloqueoSeparar[] } {
  const acciones: AccionSeparar[] = [];
  const bloqueos: BloqueoSeparar[] = [];
  const lineas = new Map(input.lineas.map((l) => [l.id, l]));
  const items = new Map(input.items.map((i) => [i.id, i]));
  const abonos = new Map(input.abonos.map((a) => [a.id, a]));
  const solicitudes = new Map(input.solicitudes.map((s) => [s.id, s]));

  for (const op of input.operaciones) {
    if (!op.ordenId || CERRADAS.has(op.estado)) continue;
    const ordenId = op.ordenId;
    const propias: AccionSeparar[] = [];
    const problemas: string[] = [];

    if (op.documentos > 0) problemas.push("tiene recibos o facturas emitidos desde la operación");

    for (const id of op.abonoIds) {
      const a = abonos.get(id);
      if (!a) { problemas.push(`no se pudo leer el abono ${id}`); continue; }
      if (!a.ordenIds.includes(ordenId)) { problemas.push(`el abono ${a.numero} ($${a.monto}) no está enlazado a la orden`); continue; }
      propias.push({ tipo: "abono_solo_orden", id, op: op.codigo, numero: a.numero, monto: a.monto, operacionIds: a.operacionIds.filter((x) => x !== op.id) });
    }

    const lineasDeOp = op.lineaIds.map((id) => lineas.get(id)).filter((l): l is LineaParaSeparar => !!l);
    for (const l of lineasDeOp) {
      if (l.ordenId !== ordenId) { problemas.push(`la línea ${l.id} no es de la orden ${op.ordenCodigo}`); continue; }
      propias.push({ tipo: "linea_sin_op", id: l.id, op: op.codigo });
    }

    for (const id of op.itemIds) {
      const it = items.get(id);
      if (!it) { problemas.push(`no se pudo leer el artículo ${id}`); continue; }
      if (!lineasDeOp.some((l) => l.itemId === id)) { problemas.push(`${it.sku} no está cargado en ninguna línea de la orden`); continue; }
      propias.push({
        tipo: "item_a_orden", id, op: op.codigo, sku: it.sku, ordenId,
        operacionIds: it.operacionIds.filter((x) => x !== op.id),
        ordenStockIds: [...new Set([...it.ordenStockIds, ordenId])],
      });
    }

    for (const id of op.solicitudIds) {
      const s = solicitudes.get(id);
      if (!s) { problemas.push(`no se pudo leer la solicitud ${id}`); continue; }
      const linea = lineasDeOp.length === 1 ? lineasDeOp[0] : null;
      if (!linea) { problemas.push(`${s.codigo}: la operación no tiene una sola línea en la orden`); continue; }
      propias.push({ tipo: "solicitud_a_orden", id, op: op.codigo, codigo: s.codigo, ordenId, lineaId: linea.id });
    }

    if (problemas.length) { bloqueos.push({ op: op.codigo, motivo: problemas.join("; ") }); continue; }
    const nota = NOTA_SEPARACION(op.ordenCodigo);
    propias.push({
      tipo: "cerrar_op", id: op.id, op: op.codigo, orden: op.ordenCodigo,
      observacion: op.observacion.includes(nota) ? op.observacion : [op.observacion.trim(), nota].filter(Boolean).join("\n"),
    });
    acciones.push(...propias);
  }
  return { acciones, bloqueos };
}

/** Las cifras que deben quedar iguales en cada orden. */
export type CifrasCuenta = { totalCuenta: number; totalAbonado: number; saldo: number };

export function mismasCifras(antes: CifrasCuenta, despues: CifrasCuenta): boolean {
  const eq = (a: number, b: number) => Math.abs((a || 0) - (b || 0)) < 0.005;
  return eq(antes.totalCuenta, despues.totalCuenta) && eq(antes.totalAbonado, despues.totalAbonado) && eq(antes.saldo, despues.saldo);
}

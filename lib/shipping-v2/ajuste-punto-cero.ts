// Punto cero del inventario (decisión del dueño, 12-nov-2026).
//
// El inventario general del 7-nov (aplicado el 9-nov) es la realidad física de
// la tienda. Desde ese conteo, los 1.119 registros cuadran (lo contado + lo que
// entró − lo que salió = la tienda de hoy). Lo único que arrastra el pasado es:
//
//  1. El Kardex de 5 registros, que al cerrar el conteo no decía lo contado
//     (OTR-000028, LAP-000062, LAP-000016, LAP-000017, REP-000003). Se iguala
//     con UN movimiento "Ajuste del Kardex" con la fecha del conteo.
//  2. "Unidades compradas" de OTR-000028: el ajuste 9b (12-oct) guardó 3 porque
//     ya se había vendido 1; el pago PAY-20260803-99078 ($1.095,99) se calculó
//     con 4. Se corrige a 4 (dato del pago; el stock no cambia).
//
// Lo demás anterior al conteo NO se rellena: la revisión de unidades ya no lo
// compara (ver `verificadoEnCorte` en revision-inventario.ts).
//
// Módulo puro: sin red. Lo usa scripts/ajuste-inventario-punto-cero.ts.

import { claveKardex, crearMovimiento, registroDeCampos, unidadesEnLibro, type MovimientoKardex } from "./kardex";
import type { CorteInventario } from "./revision-inventario";

export type CorteConId = CorteInventario & { id: string };
export type RegistroItem = { id: string; fields: Record<string, unknown> };

export const HECHO_POR_PUNTO_CERO = "Inventario 7-nov (aprobado por el dueño)";

export type FilaPuntoCero = {
  id: string;
  sku: string;
  /** Lo que decía el libro al cerrar el conteo. */
  libroAlCorte: number;
  /** Lo que había en la tienda al cerrar el conteo (= hoy − lo movido después). */
  tiendaAlCorte: number;
  ajuste: number;
};

export type PlanKardexPuntoCero = {
  movimientos: MovimientoKardex[];
  filas: FilaPuntoCero[];
  /** Registros que no se pueden explicar (la tienda al corte saldría negativa): no se tocan. */
  revisar: Array<{ id: string; sku: string; motivo: string }>;
};

export function clavePuntoCero(corteId: string, itemId: string) {
  return claveKardex("punto-cero", corteId, itemId);
}

export function planKardexPuntoCero(input: { corte: CorteConId; items: RegistroItem[]; movimientos: readonly MovimientoKardex[] }): PlanKardexPuntoCero {
  const fechaCorte = Date.parse(input.corte.fecha);
  if (!Number.isFinite(fechaCorte)) throw new Error("El conteo no tiene fecha de aplicado.");
  const claves = new Set(input.movimientos.map((m) => m.clave));
  const porItem = new Map<string, MovimientoKardex[]>();
  for (const m of input.movimientos) porItem.set(m.registroId, [...(porItem.get(m.registroId) ?? []), m]);

  const out: PlanKardexPuntoCero = { movimientos: [], filas: [], revisar: [] };
  for (const it of input.items) {
    const movs = porItem.get(it.id) ?? [];
    let antes = 0;
    let despues = 0;
    for (const m of movs) {
      if (Date.parse(m.fecha) > fechaCorte) despues += m.cantidad;
      else antes += m.cantidad;
    }
    const tiendaAlCorte = unidadesEnLibro(it.fields) - despues;
    const registro = registroDeCampos(it.id, it.fields);
    if (tiendaAlCorte < 0) {
      out.revisar.push({ id: it.id, sku: registro.sku, motivo: `Hoy ${unidadesEnLibro(it.fields)} en la tienda y ${despues} movidas después del conteo: no se puede saber cuántas había.` });
      continue;
    }
    if (tiendaAlCorte === antes) continue;
    const clave = clavePuntoCero(input.corte.id, it.id);
    out.filas.push({ id: it.id, sku: registro.sku, libroAlCorte: antes, tiendaAlCorte, ajuste: tiendaAlCorte - antes });
    if (claves.has(clave)) continue;
    out.movimientos.push(
      crearMovimiento({
        clave,
        motivo: "Ajuste del Kardex",
        cantidad: tiendaAlCorte - antes,
        registro,
        fecha: input.corte.fecha,
        documentoTipo: "Conteo",
        documentoId: input.corte.id,
        documento: `Conteo ${input.corte.nombre}`,
        hechoPor: HECHO_POR_PUNTO_CERO,
        nota: `Punto cero del inventario: el libro decía ${antes} y en el conteo había ${tiendaAlCorte}. La historia anterior al conteo no tenía todos sus respaldos.`,
        origen: "Sistema",
      })
    );
  }
  return out;
}

// ─── "Unidades compradas" con prueba ─────────────────────────────────────────

export type CorreccionCompradas = { id: string; sku: string; antes: number; despues: number; motivo: string };

/** Solo las que tienen prueba documental. Cada una se aplica una vez (si ya tiene el valor nuevo, no se toca). */
export const CORRECCIONES_COMPRADAS: CorreccionCompradas[] = [
  {
    id: "recbHEfy31mJOdsfa",
    sku: "OTR-000028",
    antes: 3,
    despues: 4,
    motivo:
      "El pago PAY-20260803-99078 ($1.095,99) se calculó con 4 cables (con 3 la caja suma $1.095,51; faltan $0,48 = 1 cable). " +
      "El ajuste 9b del 12-oct guardó 3 porque ya se había vendido 1 con REC-000004. La nota del registro dice \"2 blancos y 2 anker\". " +
      "El stock no cambia (1, respaldado por el conteo del 7-nov).",
  },
];

export type PlanCompradas = { cambiar: CorreccionCompradas[]; yaHechas: CorreccionCompradas[]; revisar: Array<CorreccionCompradas & { actual: unknown }> };

export function planCorreccionesCompradas(items: RegistroItem[], correcciones = CORRECCIONES_COMPRADAS): PlanCompradas {
  const porId = new Map(items.map((i) => [i.id, i.fields]));
  const out: PlanCompradas = { cambiar: [], yaHechas: [], revisar: [] };
  for (const c of correcciones) {
    const actual = porId.get(c.id)?.["Unidades compradas"];
    if (actual === c.despues) out.yaHechas.push(c);
    else if (actual === c.antes) out.cambiar.push(c);
    else out.revisar.push({ ...c, actual });
  }
  return out;
}

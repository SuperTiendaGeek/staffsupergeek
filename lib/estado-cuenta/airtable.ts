import "server-only";

// Estado de cuenta EN BLOQUE (auditoría ops, punto 4).
//
// Lee de una sola vez lo que necesitan muchas cuentas (panel de Cobros,
// tablero de Operaciones, reporte de diferencias) y pasa cada una por la
// MISMA calculadora que la pantalla de la orden (./reglas.ts). La lectura
// detallada de una cuenta vive en lib/cuenta-unificada; las dos le entregan a
// la calculadora exactamente los mismos datos:
//   · servicios, productos digitales y repuestos históricos: los rollups de
//     la orden ("Costo Total Servicios NV", "Total Productos Digitales",
//     "Costo Total Repuestos NV");
//   · artículos (pedido y stock): "Precio venta final" × las unidades que pidió
//     el cliente (la "Cantidad" de su opción) — NO el rollup "Total a Pagar
//     NV", que suma el artículo sin mirar las unidades;
//   · lo aprobado sin artículo (presupuesto + pedidos sin línea);
//   · abonos de la orden y de todos sus pedidos, sin repetir.
//
// Regla de la casa: nunca filtrar por campo de link; los ids salen de los
// campos inversos y se busca por RECORD_ID().

import { loadAirtableEnv } from "@/lib/tecnicos/config/airtable";
import { lineasPorIds } from "@/lib/tecnicos/presupuesto/airtable";
import { cantidadDeOpcion } from "@/lib/operaciones/opciones";
import type { CuentaUnificadaAprobadoSinArticulo } from "@/types/cuenta-unificada";
import { CAMPO_DESCUENTOS, CAMPOS_DESCUENTO, TABLA_DESCUENTOS, descuentoDesdeCampos, type DescuentoCuenta } from "./descuentos";
import {
  calcularEstadoCuenta,
  pendientesDeLaCuenta,
  precioClienteDeItem,
  type AbonoParaCuenta,
  type EstadoDeCuenta,
  type ItemParaCuenta,
  type OperacionParaCuenta,
} from "./reglas";

export type Registro = { id: string; fields: Record<string, unknown> };

const T_ORDENES = "Órdenes de Reparación";
const T_OPERACIONES = "Operación Comercial";
const T_ABONOS = "Abonos";
const T_ITEMS = "Shipping Items";
const T_OPCIONES = "Opciones";

// Los ids van dentro de filterByFormula, que viaja en la URL: 40 por lote deja
// la URL muy por debajo del límite de Airtable.
const LOTE_IDS = 40;

function cliente() {
  const { token, baseId } = loadAirtableEnv();
  return {
    baseUrl: `https://api.airtable.com/v0/${baseId}`,
    headers: { Authorization: `Bearer ${token}` } as Record<string, string>,
  };
}

/** Lista una tabla (todas las páginas). Lanza ante cualquier error: una cuenta leída a medias da cifras falsas. */
export async function listarTodo(tabla: string, campos: string[], formula?: string): Promise<Registro[]> {
  const c = cliente();
  const out: Registro[] = [];
  let offset: string | undefined;
  do {
    const url = new URL(`${c.baseUrl}/${encodeURIComponent(tabla)}`);
    url.searchParams.set("pageSize", "100");
    for (const f of campos) url.searchParams.append("fields[]", f);
    if (formula) url.searchParams.set("filterByFormula", formula);
    if (offset) url.searchParams.set("offset", offset);
    const res = await fetch(url.toString(), { headers: c.headers, cache: "no-store" });
    if (!res.ok) throw new Error(`Airtable ${tabla} ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { records?: Registro[]; offset?: string };
    out.push(...(data.records ?? []));
    offset = data.offset;
  } while (offset);
  return out;
}

export async function porIds(tabla: string, lista: string[], campos: string[]): Promise<Map<string, Registro>> {
  const unicos = [...new Set(lista)].filter(Boolean);
  const mapa = new Map<string, Registro>();
  for (let i = 0; i < unicos.length; i += LOTE_IDS) {
    const lote = unicos.slice(i, i + LOTE_IDS);
    const formula = lote.length === 1
      ? `RECORD_ID()='${lote[0]}'`
      : `OR(${lote.map((id) => `RECORD_ID()='${id}'`).join(",")})`;
    for (const r of await listarTodo(tabla, campos, formula)) mapa.set(r.id, r);
  }
  return mapa;
}

export const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
export const texto = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) { const s = v.find((x) => typeof x === "string"); return typeof s === "string" ? s : ""; }
  if (v && typeof v === "object" && "name" in v) return String((v as { name: unknown }).name ?? "");
  return "";
};
export const numero = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

/** Campos de la orden que el cálculo necesita (quien ya lista órdenes los agrega a su lectura). */
export const CAMPOS_ORDEN_CUENTA = [
  "Costo Total Servicios NV",
  "Total Productos Digitales",
  "Costo Total Repuestos NV",
  "Repuestos de Stock (V2)",
  "Operaciones Comerciales",
  "Abonos (Operación)",
  "Presupuesto por Orden",
  "Servicios por Orden",
  "Productos Digitales",
  "Repuestos por Orden",
  CAMPO_DESCUENTOS,
];

const CAMPOS_OPERACION_CUENTA = [
  "Código Operación",
  "Producto Solicitado",
  "Estado",
  "Opción Elegida",
  "Artículo físico",
  "Abonos",
  "Orden de Reparación",
  CAMPO_DESCUENTOS,
];

export type CuentaEnBloque = EstadoDeCuenta & {
  aprobadoSinArticulo: CuentaUnificadaAprobadoSinArticulo[];
  /** Abonos de la cuenta (orden + pedidos), sin repetir; incluye anulados con su estado. */
  abonos: AbonoParaCuenta[];
};

type Lecturas = {
  operaciones: Map<string, Registro>;
  items: Map<string, Registro>;
  opciones: Map<string, Registro>;
  abonos: Map<string, Registro>;
  lineas: Map<string, Awaited<ReturnType<typeof lineasPorIds>>[number]>;
  descuentos: Map<string, DescuentoCuenta>;
};

async function leerDependencias(ordenes: Registro[], operacionesSueltas: Registro[]): Promise<Lecturas> {
  const opIdsDeOrdenes = ordenes.flatMap((o) => ids(o.fields["Operaciones Comerciales"]));
  const operaciones = await porIds(T_OPERACIONES, opIdsDeOrdenes, CAMPOS_OPERACION_CUENTA);
  for (const op of operacionesSueltas) operaciones.set(op.id, op);
  const todasOps = [...operaciones.values()];

  const itemIds = [
    ...todasOps.flatMap((op) => ids(op.fields["Artículo físico"])),
    ...ordenes.flatMap((o) => ids(o.fields["Repuestos de Stock (V2)"])),
  ];
  const lineaIds = ordenes.flatMap((o) => ids(o.fields["Presupuesto por Orden"]));
  const abonoIds = [
    ...ordenes.flatMap((o) => ids(o.fields["Abonos (Operación)"])),
    ...todasOps.flatMap((op) => ids(op.fields["Abonos"])),
  ];
  const descuentoIds = [
    ...ordenes.flatMap((o) => ids(o.fields[CAMPO_DESCUENTOS])),
    ...operacionesSueltas.flatMap((op) => ids(op.fields[CAMPO_DESCUENTOS])),
  ];
  const [items, abonos, lineasLista, descuentosLeidos] = await Promise.all([
    porIds(T_ITEMS, itemIds, ["Precio venta final", "Opción origen"]),
    porIds(T_ABONOS, abonoIds, ["Monto", "Estado del Abono"]),
    lineasPorIds(lineaIds),
    porIds(TABLA_DESCUENTOS, descuentoIds, CAMPOS_DESCUENTO),
  ]);
  const opcionIds = [
    ...[...items.values()].flatMap((it) => ids(it.fields["Opción origen"])),
    ...todasOps.flatMap((op) => ids(op.fields["Opción Elegida"])),
  ];
  const opciones = await porIds(T_OPCIONES, opcionIds, ["Cantidad", "Precio Venta Cliente"]);
  return {
    operaciones, items, opciones, abonos,
    lineas: new Map(lineasLista.map((l) => [l.id, l])),
    descuentos: new Map([...descuentosLeidos.values()].map((r) => [r.id, descuentoDesdeCampos(r.id, r.fields)])),
  };
}

function operacionParaCuenta(op: Registro, lec: Lecturas): OperacionParaCuenta {
  const elegidas = ids(op.fields["Opción Elegida"]);
  return {
    id: op.id,
    producto: texto(op.fields["Producto Solicitado"]) || texto(op.fields["Código Operación"]) || op.id,
    estado: texto(op.fields["Estado"]),
    precioOpcionElegida: elegidas.reduce((s, id) => s + numero(lec.opciones.get(id)?.fields["Precio Venta Cliente"]), 0),
    tieneOpcionElegida: elegidas.length > 0,
    tieneArticulo: ids(op.fields["Artículo físico"]).length > 0,
  };
}

/** Artículos de los pedidos: precio × unidades de la opción de la que nació (o la elegida). */
function itemsDePedidos(operaciones: Registro[], lec: Lecturas): ItemParaCuenta[] {
  const out: ItemParaCuenta[] = [];
  for (const op of operaciones) {
    const elegida = ids(op.fields["Opción Elegida"])[0] ?? null;
    for (const itemId of ids(op.fields["Artículo físico"])) {
      const it = lec.items.get(itemId);
      if (!it) continue;
      const opcionId = ids(it.fields["Opción origen"])[0] ?? elegida;
      const cantidad = opcionId && lec.opciones.has(opcionId) ? cantidadDeOpcion(lec.opciones.get(opcionId)!.fields["Cantidad"]) : 1;
      out.push({ id: it.id, precio: precioClienteDeItem(numero(it.fields["Precio venta final"]), cantidad) });
    }
  }
  return out;
}

function abonosDe(abonoIds: string[], lec: Lecturas): AbonoParaCuenta[] {
  return abonoIds
    .map((id) => lec.abonos.get(id))
    .filter((a): a is Registro => !!a)
    .map((a) => ({ id: a.id, monto: numero(a.fields["Monto"]), estado: texto(a.fields["Estado del Abono"]) }));
}

function descuentosDe(descuentoIds: string[], lec: Lecturas): DescuentoCuenta[] {
  return descuentoIds.map((id) => lec.descuentos.get(id)).filter((d): d is DescuentoCuenta => !!d);
}

function cuentaDeOrden(orden: Registro, lec: Lecturas): CuentaEnBloque {
  const f = orden.fields;
  const operaciones = ids(f["Operaciones Comerciales"]).map((id) => lec.operaciones.get(id)).filter((r): r is Registro => !!r);
  const stockIds = ids(f["Repuestos de Stock (V2)"]);
  const items: ItemParaCuenta[] = [
    ...itemsDePedidos(operaciones, lec),
    ...stockIds
      .map((id) => lec.items.get(id))
      .filter((r): r is Registro => !!r)
      .map((it) => ({ id: it.id, precio: precioClienteDeItem(numero(it.fields["Precio venta final"]), 1) })),
  ];
  const aprobadoSinArticulo = pendientesDeLaCuenta({
    lineas: ids(f["Presupuesto por Orden"]).map((id) => lec.lineas.get(id)).filter((l): l is NonNullable<typeof l> => !!l),
    serviciosIds: new Set(ids(f["Servicios por Orden"])),
    digitalesIds: new Set(ids(f["Productos Digitales"])),
    itemsStockIds: new Set(stockIds),
    operaciones: operaciones.map((op) => operacionParaCuenta(op, lec)),
  });
  const abonoIds = [...new Set([
    ...ids(f["Abonos (Operación)"]),
    ...operaciones.flatMap((op) => ids(op.fields["Abonos"])),
  ])];
  const abonos = abonosDe(abonoIds, lec);
  const estado = calcularEstadoCuenta({
    cargos: {
      servicios: numero(f["Costo Total Servicios NV"]),
      productosDigitales: numero(f["Total Productos Digitales"]),
      repuestosHistoricos: numero(f["Costo Total Repuestos NV"]),
      items,
      aprobadoSinArticulo,
      descuentos: descuentosDe(ids(f[CAMPO_DESCUENTOS]), lec),
      cargosExistentes: new Set([
        ...items.map((i) => i.id),
        ...ids(f["Servicios por Orden"]),
        ...ids(f["Productos Digitales"]),
        ...ids(f["Repuestos por Orden"]),
      ]),
    },
    abonos,
  });
  return { ...estado, aprobadoSinArticulo, abonos };
}

function cuentaDeOperacionSuelta(op: Registro, lec: Lecturas): CuentaEnBloque {
  const aprobadoSinArticulo = pendientesDeLaCuenta({
    lineas: [],
    serviciosIds: new Set(),
    digitalesIds: new Set(),
    itemsStockIds: new Set(),
    operaciones: [operacionParaCuenta(op, lec)],
  });
  const abonos = abonosDe([...new Set(ids(op.fields["Abonos"]))], lec);
  const items = itemsDePedidos([op], lec);
  const estado = calcularEstadoCuenta({
    cargos: {
      servicios: 0, productosDigitales: 0, repuestosHistoricos: 0, items, aprobadoSinArticulo,
      descuentos: descuentosDe(ids(op.fields[CAMPO_DESCUENTOS]), lec),
      cargosExistentes: new Set(items.map((i) => i.id)),
    },
    abonos,
  });
  return { ...estado, aprobadoSinArticulo, abonos };
}

/**
 * Estado de cuenta de varias órdenes ya leídas (con CAMPOS_ORDEN_CUENTA).
 * Devuelve un mapa ordenId → cuenta completa (orden + todos sus pedidos).
 */
export async function estadosDeCuentaDeOrdenes(ordenes: Registro[]): Promise<Map<string, CuentaEnBloque>> {
  if (ordenes.length === 0) return new Map();
  const lec = await leerDependencias(ordenes, []);
  return new Map(ordenes.map((o) => [o.id, cuentaDeOrden(o, lec)]));
}

/**
 * Estado de cuenta de un conjunto de operaciones, como lo ve el tablero:
 * una operación con orden muestra la cuenta COMPLETA de su orden (la orden y
 * todos sus pedidos: una cuenta, un documento); una operación suelta, la suya.
 * Devuelve un mapa operacionId → cuenta.
 */
export async function estadosDeCuentaDeOperaciones(operacionIds: string[]): Promise<Map<string, CuentaEnBloque & { ordenId: string | null }>> {
  const ops = await porIds(T_OPERACIONES, operacionIds, CAMPOS_OPERACION_CUENTA);
  const ordenIds = [...new Set([...ops.values()].flatMap((op) => ids(op.fields["Orden de Reparación"]).slice(0, 1)))];
  const ordenes = [...(await porIds(T_ORDENES, ordenIds, CAMPOS_ORDEN_CUENTA)).values()];
  const sueltas = [...ops.values()].filter((op) => ids(op.fields["Orden de Reparación"]).length === 0);
  const lec = await leerDependencias(ordenes, sueltas);
  const porOrden = new Map(ordenes.map((o) => [o.id, cuentaDeOrden(o, lec)]));
  const out = new Map<string, CuentaEnBloque & { ordenId: string | null }>();
  for (const op of ops.values()) {
    const ordenId = ids(op.fields["Orden de Reparación"])[0] ?? null;
    if (ordenId) {
      const c = porOrden.get(ordenId);
      if (c) out.set(op.id, { ...c, ordenId });
    } else {
      out.set(op.id, { ...cuentaDeOperacionSuelta(op, lec), ordenId: null });
    }
  }
  return out;
}

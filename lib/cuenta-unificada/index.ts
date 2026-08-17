import {
  fetchRepuestosPorOrden,
  fetchServiciosPorOrden,
  fetchAbonosPorOrden,
  fetchProductosDigitalesPorOrden,
} from "@/lib/tecnicos/airtable";
import { resolveModoRepuestos } from "./config";
import type {
  CuentaUnificada,
  CuentaUnificadaAbono,
  CuentaUnificadaItem,
  CuentaUnificadaProductoDigital,
  CuentaUnificadaRepuestoHistorico,
  CuentaUnificadaServicio,
  GetCuentaUnificadaInput,
  ModoRepuestos,
} from "@/types/cuenta-unificada";
import { esAbonoVigente } from "@/types/cuenta-unificada";
import type { ProductoDigital } from "@/lib/tecnicos/airtable";

// ─── Gates de repuestos (extraído para poder testearlo sin mockear todo el
// árbol de fetches de getCuentaUnificada) ────────────────────────────────────
//
// La fuente única de verdad de una orden suma todas sus piezas reales:
// repuestos históricos, repuestos de stock V2 y artículos de sus operaciones.
// El viejo campo "Modo repuestos" fue solo un andamio de migración; usarlo como
// gate ocultaba dinero real en órdenes mixtas.
export function resolverGatesRepuestos(input: {
  ordenId: string | null;
  operacionId: string | null;
  modoRepuestos?: ModoRepuestos | null;
}): { legacyCuentanParaTotal: boolean; incluyeStockV2: boolean } {
  const hayOrden = input.ordenId != null;
  return {
    legacyCuentanParaTotal: hayOrden,
    incluyeStockV2: hayOrden,
  };
}

// Link "Shipping Items" → "Órdenes de Reparación" exclusivo para repuestos de
// stock en modo V2 (distinto de "Operación Comercial", que es para pedido).
const ORDEN_STOCK_LINK_FIELD = "Orden de Reparación (Stock)";
// Inverso en Órdenes de Reparación del campo anterior.
const REPUESTOS_STOCK_FIELD = "Repuestos de Stock (V2)";

const ORDENES_TABLE = "Órdenes de Reparación";
const OPERACIONES_TABLE = "Operación Comercial";
const SHIPPING_ITEMS_TABLE = "Shipping Items";
const ABONOS_TABLE = "Abonos";
const CATALOGO_PRODUCTOS_DIGITALES_TABLE = "Catálogo Productos Digitales";

type AirtableRecord = {
  id: string;
  createdTime?: string;
  fields: Record<string, unknown>;
};

type AirtableClient = {
  baseUrl: string;
  headers: HeadersInit;
};

function getClient(): AirtableClient {
  const token = process.env.AIRTABLE_API_KEY?.trim();
  const baseId = process.env.AIRTABLE_BASE_ID?.trim();
  if (!token) throw new Error("Falta AIRTABLE_API_KEY en .env.local.");
  if (!baseId) throw new Error("Falta AIRTABLE_BASE_ID en .env.local.");
  return {
    baseUrl: `https://api.airtable.com/v0/${baseId}`,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };
}

function linkedIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim() !== "");
}

function firstString(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim() !== "") return value;
  return fallback;
}

function firstNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

async function fetchRecord(
  client: AirtableClient,
  tableName: string,
  id: string
): Promise<AirtableRecord | null> {
  const res = await fetch(`${client.baseUrl}/${encodeURIComponent(tableName)}/${encodeURIComponent(id)}`, {
    headers: client.headers,
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as AirtableRecord;
}

// Reglas de la casa: nunca filtrar por campo de link directamente — se leen los
// IDs del campo inverso ya presentes en el registro y se hace fetch por RECORD_ID().
async function fetchRecordsByIds(
  client: AirtableClient,
  tableName: string,
  ids: string[]
): Promise<AirtableRecord[]> {
  if (ids.length === 0) return [];
  const formula =
    ids.length === 1
      ? `RECORD_ID()='${ids[0]}'`
      : `OR(${ids.map((id) => `RECORD_ID()='${id}'`).join(",")})`;
  const url = new URL(`${client.baseUrl}/${encodeURIComponent(tableName)}`);
  url.searchParams.set("filterByFormula", formula);
  url.searchParams.set("pageSize", "100");
  const res = await fetch(url.toString(), { headers: client.headers, cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as { records?: AirtableRecord[] };
  return data.records ?? [];
}

function mapShippingItemToCuentaItem(
  record: AirtableRecord,
  origen: "pedido" | "stock"
): CuentaUnificadaItem {
  const f = record.fields;
  return {
    id: record.id,
    nombre: firstString(f["Nombre del item"], "Artículo sin nombre"),
    origen,
    precio: firstNumber(f["Precio venta final"]),
  };
}

function mapAbonoRecordToCuentaAbono(
  record: AirtableRecord,
  origen: "orden" | "operacion"
): CuentaUnificadaAbono {
  const f = record.fields;
  const idAbono = f["ID Abono"];
  return {
    id: record.id,
    idAbono: typeof idAbono === "number" ? String(idAbono) : null,
    fecha: typeof f["Fecha de Abono"] === "string" ? (f["Fecha de Abono"] as string) : null,
    monto: firstNumber(f["Monto"]),
    metodoPago: typeof f["Método de Pago"] === "string" ? (f["Método de Pago"] as string) : null,
    estado: firstString(f["Estado del Abono"], "Registrado"),
    origen,
    observacion: typeof f["Observación"] === "string" ? (f["Observación"] as string) : null,
    // Nombre exacto del campo, con tilde — Airtable falla en silencio si difiere.
    numeroTransaccion: typeof f["Número de Transacción"] === "string" ? (f["Número de Transacción"] as string) : null,
  };
}

// La lista completa detrás del rollup "Total Productos Digitales" que ya se
// leía (ver totalProductosDigitales más abajo) — Fase de facturación: hace
// falta la lista, no solo el total, para poder construir una línea de
// factura por cada producto digital.
//
// El nombre comercial limpio viene del CATÁLOGO ("Producto Base"), nunca de
// ProductoDigital.softwareProducto: ese campo se lee de "Producto Digital"
// en Airtable, una fórmula que concatena Catálogo · Estado · Fecha de
// compra (p.ej. "McAfee AntiVirus 1 Year · Usado · 11/08/2026" — hallazgo
// real en OR000418). Esa cadena viajaba tal cual a la descripción de la
// línea de factura — al XML del SRI y al RIDE del cliente. Un documento
// tributario no puede decir que el producto está "Usado" ni llevar la fecha
// en que SUPER GEEK se lo compró al proveedor. Empeora desde que
// asignarProductoDigitalAOrden() dejó de escribir "Usado" al vincular (ver
// 8a6ca33): el producto queda "Disponible" hasta que la factura se
// autoriza, así que la próxima factura habría dicho "· Disponible ·".
//
// softwareProducto SIGUE existiendo tal cual para /tecnicos/productos-
// digitales (OrdenDetalle.productosDigitales, un array distinto de este) —
// ahí ver el estado y la fecha de compra sí es útil. Este cambio solo toca
// la fuente de CuentaUnificadaProductoDigital.nombre, que es lo único que
// alimenta la línea de factura (construccion.ts).
function mapProductoDigitalToCuenta(
  p: ProductoDigital,
  nombresCatalogo: Map<string, string>
): CuentaUnificadaProductoDigital {
  return {
    id: p.id,
    // Vacío si el producto no tiene catálogo vinculado, o el catálogo no
    // tiene "Producto Base" — NUNCA cae a softwareProducto (el campo sucio).
    // Un nombre vacío bloquea la pre-factura más adelante
    // (evaluarProductoDigitalNoListo, construccion.ts), no se inventa nada.
    nombre: (p.catalogoId && nombresCatalogo.get(p.catalogoId)) || "",
    precioVenta: p.precioVenta ?? 0,
    precioVentaCatalogo: p.precioVentaCatalogo ?? 0,
  };
}

// "Software / Producto" es un campo de enlace: la API de Airtable devuelve
// el record id del catálogo, no su nombre — no hay lookup de "Producto
// Base" en la tabla "Productos Digitales" (verificado contra el esquema
// real), así que hay que resolverlo con un fetch aparte. Regla de la casa:
// por RECORD_ID(), nunca filtrando por el propio campo de enlace.
async function fetchNombresCatalogoProductosDigitales(
  catalogoIds: string[],
  client: AirtableClient
): Promise<Map<string, string>> {
  const ids = [...new Set(catalogoIds)];
  const records = await fetchRecordsByIds(client, CATALOGO_PRODUCTOS_DIGITALES_TABLE, ids);
  const map = new Map<string, string>();
  for (const r of records) {
    // Sin fallback a "Sin nombre" aquí a propósito — ver el porqué junto a
    // mapProductoDigitalToCuenta().
    map.set(r.id, firstString(r.fields["Producto Base"], ""));
  }
  return map;
}

// Repuestos "de stock" en modo V2: leídos vía el link "Repuestos de Stock (V2)"
// en la orden (inverso de Shipping Items."Orden de Reparación (Stock)").
async function fetchRepuestosStockV2(
  ordenRecord: AirtableRecord,
  client: AirtableClient
): Promise<CuentaUnificadaItem[]> {
  const itemIds = linkedIds(ordenRecord.fields[REPUESTOS_STOCK_FIELD]);
  const records = await fetchRecordsByIds(client, SHIPPING_ITEMS_TABLE, itemIds);
  return records.map((r) => mapShippingItemToCuentaItem(r, "stock"));
}

function mapRepuestoHistorico(r: {
  id: string;
  repuestoNombre: string;
  cantidad: number | null;
  precioCliente: number | null;
  subtotalCliente: number | null;
}): CuentaUnificadaRepuestoHistorico {
  const subtotal =
    r.subtotalCliente ??
    (r.cantidad != null && r.precioCliente != null ? r.cantidad * r.precioCliente : r.precioCliente ?? 0);
  return {
    id: r.id,
    nombre: r.repuestoNombre,
    cantidad: r.cantidad,
    precioCliente: r.precioCliente,
    subtotal,
  };
}

async function fetchItemsPedido(
  operacionRecord: AirtableRecord,
  client: AirtableClient
): Promise<CuentaUnificadaItem[]> {
  // "Artículo físico" es el inverso de Shipping Items."Operación Comercial".
  const itemIds = linkedIds(operacionRecord.fields["Artículo físico"]);
  const records = await fetchRecordsByIds(client, SHIPPING_ITEMS_TABLE, itemIds);
  return records.map((r) => mapShippingItemToCuentaItem(r, "pedido"));
}

async function fetchAbonosOperacion(
  operacionRecord: AirtableRecord,
  client: AirtableClient
): Promise<CuentaUnificadaAbono[]> {
  // "Abonos" en Operación Comercial es el inverso de Abonos."Aplicado a: Operación".
  const abonoIds = linkedIds(operacionRecord.fields["Abonos"]);
  const records = await fetchRecordsByIds(client, ABONOS_TABLE, abonoIds);
  return records.map((r) => mapAbonoRecordToCuentaAbono(r, "operacion"));
}

/**
 * Cuenta unificada Orden↔Operación (Fase 11).
 *
 * Resuelve el par vía el link bidireccional Orden↔Operación y devuelve, en una
 * sola estructura, los items (repuestos), servicios, abonos de ambos lados y
 * los totales/saldo ya calculados. Consumida por igual desde las pantallas de
 * técnicos (orden) y de operaciones — ninguna de las dos recalcula nada.
 *
 * Caso sin vínculo: si el lado dado no tiene su par vinculado, la respuesta
 * mantiene la misma forma pero solo con los datos del lado propio.
 */
export async function getCuentaUnificada(
  input: GetCuentaUnificadaInput
): Promise<CuentaUnificada> {
  const client = getClient();

  let ordenRecord: AirtableRecord | null = null;
  let operacionRecord: AirtableRecord | null = null;
  let operacionRecords: AirtableRecord[] = [];

  if ("ordenId" in input) {
    ordenRecord = await fetchRecord(client, ORDENES_TABLE, input.ordenId);
    if (!ordenRecord) throw new Error(`Orden ${input.ordenId} no encontrada.`);
    // "Operaciones Comerciales" es el inverso de Operación Comercial."Orden de Reparación".
    // Es N:M: la cuenta suma TODAS las operaciones de la orden, aunque para
    // compatibilidad exponga la primera como operación principal.
    const operacionIds = linkedIds(ordenRecord.fields["Operaciones Comerciales"]);
    if (operacionIds.length > 0) {
      const records = await fetchRecordsByIds(client, OPERACIONES_TABLE, operacionIds);
      const porId = new Map(records.map((r) => [r.id, r]));
      operacionRecords = operacionIds.map((id) => porId.get(id)).filter((r): r is AirtableRecord => Boolean(r));
      operacionRecord = operacionRecords[0] ?? null;
    }
  } else {
    operacionRecord = await fetchRecord(client, OPERACIONES_TABLE, input.operacionId);
    if (!operacionRecord) throw new Error(`Operación ${input.operacionId} no encontrada.`);
    const ordenId = linkedIds(operacionRecord.fields["Orden de Reparación"])[0] ?? null;
    if (ordenId) ordenRecord = await fetchRecord(client, ORDENES_TABLE, ordenId);
    if (ordenRecord) {
      const operacionIds = linkedIds(ordenRecord.fields["Operaciones Comerciales"]);
      const ids = operacionIds.includes(operacionRecord.id)
        ? operacionIds
        : [operacionRecord.id, ...operacionIds];
      const records = await fetchRecordsByIds(client, OPERACIONES_TABLE, ids);
      const porId = new Map(records.map((r) => [r.id, r]));
      operacionRecords = ids.map((id) => porId.get(id)).filter((r): r is AirtableRecord => Boolean(r));
    } else {
      operacionRecords = [operacionRecord];
    }
  }

  const ordenId = ordenRecord?.id ?? null;
  const operacionId = operacionRecord?.id ?? null;
  const modoRepuestos = ordenRecord ? resolveModoRepuestos(ordenRecord.fields["Modo repuestos"]) : null;

  const { legacyCuentanParaTotal: repuestosLegacyCuentanParaTotal, incluyeStockV2: ordenTieneRepuestosStockV2 } =
    resolverGatesRepuestos({ ordenId, operacionId, modoRepuestos });

  const [servicios, repuestosLegacyRaw, repuestosStockV2, abonosOrden, itemsPedidoPorOperacion, abonosPorOperacion, productosDigitalesRaw] =
    await Promise.all([
      ordenId ? fetchServiciosPorOrden(ordenId) : Promise.resolve([]),
      // Siempre se trae (si hay orden) para la pestaña de históricos, sin
      // importar si cuenta o no para el total.
      ordenId ? fetchRepuestosPorOrden(ordenId) : Promise.resolve([]),
      ordenTieneRepuestosStockV2 && ordenRecord
        ? fetchRepuestosStockV2(ordenRecord, client)
        : Promise.resolve([]),
      ordenId ? fetchAbonosPorOrden(ordenId) : Promise.resolve([]),
      Promise.all(operacionRecords.map((r) => fetchItemsPedido(r, client))),
      Promise.all(operacionRecords.map((r) => fetchAbonosOperacion(r, client))),
      // Siempre de la orden, nunca de la operación (ver comentario junto a
      // totalProductosDigitales).
      ordenId ? fetchProductosDigitalesPorOrden(ordenId) : Promise.resolve([]),
    ]);
  const itemsPedido = itemsPedidoPorOperacion.flat();
  const abonosOperacion = abonosPorOperacion.flat();

  const repuestosHistoricos = repuestosLegacyRaw.map(mapRepuestoHistorico);
  // Depende de los ids de catálogo que trae productosDigitalesRaw — no puede
  // ir en el Promise.all de arriba.
  const catalogoIds = productosDigitalesRaw
    .map((p) => p.catalogoId)
    .filter((id): id is string => !!id);
  const nombresCatalogo = await fetchNombresCatalogoProductosDigitales(catalogoIds, client);
  const productosDigitales = productosDigitalesRaw.map((p) => mapProductoDigitalToCuenta(p, nombresCatalogo));

  // La lista principal de "items" es exclusivamente Shipping Items (pedido/
  // stock), tal como pide el modelo cerrado — los renglones legacy NUNCA se
  // muestran ahí (solo en la pestaña "Repuestos históricos", más abajo) para
  // evitar mostrar el mismo repuesto dos veces. Cuando cuentan para el total,
  // su subtotal se suma
  // directamente a totalCuenta, sin fabricar un "item" falso.
  const items: CuentaUnificadaItem[] = [...itemsPedido, ...repuestosStockV2];
  const totalRepuestosHistoricos = repuestosHistoricos.reduce((sum, r) => sum + r.subtotal, 0);

  const serviciosMapped: CuentaUnificadaServicio[] = servicios.map((s) => ({
    id: s.id,
    nombre: s.servicioNombre,
    costo: s.costo ?? 0,
  }));

  // Un mismo registro de Abonos puede llevar a la vez "Aplicado a: Orden" y
  // "Aplicado a: Operación": createAbonoPorOrden y crearAbono escriben ambos
  // links cuando el par orden↔operación existe, y el puente de Finanzas
  // depende de eso para la referencia legible del movimiento.
  //
  // Antes se concatenaban las dos listas sin deduplicar y el MISMO record
  // salía dos veces (caso real OR000382 ↔ OP-2026-000050: un abono de $135
  // mostrado como dos abonos de $135). La identidad de un abono es su
  // record.id, no el lado por el que se llegó a él.
  const abonosPorId = new Map<string, CuentaUnificadaAbono>();
  for (const a of abonosOrden) {
    abonosPorId.set(a.id, {
      id: a.id,
      idAbono: a.idAbono,
      fecha: a.fecha,
      monto: a.monto ?? 0,
      metodoPago: a.metodoPago,
      estado: a.estado,
      origen: "orden",
      observacion: a.observacion,
      numeroTransaccion: a.numeroTransaccion,
    });
  }
  for (const a of abonosOperacion) {
    const yaVisto = abonosPorId.get(a.id);
    if (yaVisto) yaVisto.origen = "ambos";
    else abonosPorId.set(a.id, a);
  }
  const abonos: CuentaUnificadaAbono[] = [...abonosPorId.values()].sort((a, b) =>
    (a.fecha ?? "").localeCompare(b.fecha ?? "")
  );

  // Servicios y Productos Digitales son siempre solo de la orden (nunca hay
  // ambigüedad de doble conteo con la operación), y ya existen como rollup en
  // Airtable — se leen directo en vez de sumar en JS.
  const totalServicios = ordenRecord ? firstNumber(ordenRecord.fields["Costo Total Servicios NV"]) : 0;
  const totalProductosDigitales = ordenRecord
    ? firstNumber(ordenRecord.fields["Total Productos Digitales"])
    : 0;
  // No existe (ni puede existir) un rollup de Airtable que abarque a la vez
  // Shipping Items (pedido + stock) y el histórico legacy condicional — esta
  // es justamente la cuenta que Fase 11 introduce, así que se suma en código.
  const totalRepuestos =
    items.reduce((sum, item) => sum + item.precio, 0) +
    (repuestosLegacyCuentanParaTotal ? totalRepuestosHistoricos : 0);
  const totalCuenta = totalRepuestos + totalServicios + totalProductosDigitales;

  // Los dos rollups ("Total Abonado NV" en la Orden y "Total Abonado" en la
  // Operación) NO son sumables entre sí: un abono con ambos links está dentro
  // de los dos y sumarlos lo contaba dos veces. Caso real OR000382 ↔
  // OP-2026-000050 — un único abono de $135 daba totalAbonado = $270 y un
  // "saldo a favor del cliente" de $135 que no existía.
  //
  // Se suma la lista ya deduplicada. El filtro de anulados replica en JS la
  // condición que los rollups aplicaban del lado de Airtable.
  const totalAbonado = abonos.filter(esAbonoVigente).reduce((sum, a) => sum + a.monto, 0);
  const saldo = totalCuenta - totalAbonado;

  return {
    ordenId,
    ordenIdVisible: ordenRecord ? firstString(ordenRecord.fields["ID"], ordenId ?? "") : null,
    operacionId,
    operacionCodigo: operacionRecord
      ? firstString(operacionRecord.fields["Código Operación"], operacionId ?? "")
      : null,
    modoRepuestos,
    items,
    servicios: serviciosMapped,
    repuestosHistoricos,
    repuestosHistoricosCuentanParaTotal: repuestosLegacyCuentanParaTotal,
    productosDigitales,
    abonos,
    totalRepuestos,
    totalServicios,
    totalProductosDigitales,
    totalCuenta,
    totalAbonado,
    saldo,
  };
}

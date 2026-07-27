import {
  fetchRepuestosPorOrden,
  fetchServiciosPorOrden,
  fetchAbonosPorOrden,
} from "@/lib/tecnicos/airtable";
import { resolveModoRepuestos } from "./config";
import type {
  CuentaUnificada,
  CuentaUnificadaAbono,
  CuentaUnificadaItem,
  CuentaUnificadaRepuestoHistorico,
  CuentaUnificadaServicio,
  GetCuentaUnificadaInput,
  ModoRepuestos,
} from "@/types/cuenta-unificada";

// ─── Gates de repuestos (extraído para poder testearlo sin mockear todo el
// árbol de fetches de getCuentaUnificada) ────────────────────────────────────
//
// Dos gates distintos, con motivos distintos:
//   - legacyCuentanParaTotal: evita doble conteo entre la tabla legacy
//     "Repuestos por Orden" y los items reales de la operación
//     ("Artículo físico") cuando describen el mismo repuesto físico —
//     por eso SÍ depende de si hay operación vinculada.
//   - incluyeStockV2: los repuestos de stock V2 (link "Orden de Reparación
//     (Stock)", propio de repuestos-v2.ts) son una fuente independiente de
//     "Artículo físico" — no hay overlap posible entre los dos, así que NO
//     debe depender de si hay operación vinculada. Antes de este fix
//     compartía el mismo gate que legacyCuentanParaTotal, y un repuesto de
//     stock agregado a una orden CON operación vinculada quedaba invisible
//     (ni en la cuenta unificada ni en la tarjeta de Repuestos) aunque el
//     link en Airtable fuera real — bug de Fase 11, destapado al construir
//     el gancho de Fase 16 (issue reportado sobre una orden con operación).
export function resolverGatesRepuestos(input: {
  ordenId: string | null;
  operacionId: string | null;
  modoRepuestos: ModoRepuestos | null;
}): { legacyCuentanParaTotal: boolean; incluyeStockV2: boolean } {
  const ordenAportaRepuestosPropios = input.ordenId != null && input.operacionId == null;
  return {
    legacyCuentanParaTotal: ordenAportaRepuestosPropios && input.modoRepuestos === "legacy",
    incluyeStockV2: input.ordenId != null && input.modoRepuestos === "v2",
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
    cubierto: firstNumber(f["Total Cubierto"]),
    saldo: firstNumber(f["Saldo Item"]),
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
  };
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

  if ("ordenId" in input) {
    ordenRecord = await fetchRecord(client, ORDENES_TABLE, input.ordenId);
    if (!ordenRecord) throw new Error(`Orden ${input.ordenId} no encontrada.`);
    // "Operaciones Comerciales" es el inverso de Operación Comercial."Orden de Reparación".
    const operacionId = linkedIds(ordenRecord.fields["Operaciones Comerciales"])[0] ?? null;
    if (operacionId) operacionRecord = await fetchRecord(client, OPERACIONES_TABLE, operacionId);
  } else {
    operacionRecord = await fetchRecord(client, OPERACIONES_TABLE, input.operacionId);
    if (!operacionRecord) throw new Error(`Operación ${input.operacionId} no encontrada.`);
    const ordenId = linkedIds(operacionRecord.fields["Orden de Reparación"])[0] ?? null;
    if (ordenId) ordenRecord = await fetchRecord(client, ORDENES_TABLE, ordenId);
  }

  const ordenId = ordenRecord?.id ?? null;
  const operacionId = operacionRecord?.id ?? null;
  const modoRepuestos = ordenRecord ? resolveModoRepuestos(ordenRecord.fields["Modo repuestos"]) : null;

  const { legacyCuentanParaTotal: repuestosLegacyCuentanParaTotal, incluyeStockV2: ordenTieneRepuestosStockV2 } =
    resolverGatesRepuestos({ ordenId, operacionId, modoRepuestos });

  const [servicios, repuestosLegacyRaw, repuestosStockV2, abonosOrden, itemsPedido, abonosOperacion] =
    await Promise.all([
      ordenId ? fetchServiciosPorOrden(ordenId) : Promise.resolve([]),
      // Siempre se trae (si hay orden) para la pestaña de históricos, sin
      // importar si cuenta o no para el total.
      ordenId ? fetchRepuestosPorOrden(ordenId) : Promise.resolve([]),
      ordenTieneRepuestosStockV2 && ordenRecord
        ? fetchRepuestosStockV2(ordenRecord, client)
        : Promise.resolve([]),
      ordenId ? fetchAbonosPorOrden(ordenId) : Promise.resolve([]),
      operacionRecord ? fetchItemsPedido(operacionRecord, client) : Promise.resolve([]),
      operacionRecord ? fetchAbonosOperacion(operacionRecord, client) : Promise.resolve([]),
    ]);

  const repuestosHistoricos = repuestosLegacyRaw.map(mapRepuestoHistorico);

  // La lista principal de "items" es exclusivamente Shipping Items (pedido/
  // stock), tal como pide el modelo cerrado — los renglones legacy NUNCA se
  // muestran ahí (solo en la pestaña "Repuestos históricos", más abajo) para
  // evitar mostrar el mismo repuesto dos veces. Cuando sí cuentan para el
  // total (orden Legacy sin operación vinculada), su subtotal se suma
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
  const totalAbonado = abonos
    .filter((a) => a.estado !== "Anulado")
    .reduce((sum, a) => sum + a.monto, 0);
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
    abonos,
    totalRepuestos,
    totalServicios,
    totalProductosDigitales,
    totalCuenta,
    totalAbonado,
    saldo,
  };
}

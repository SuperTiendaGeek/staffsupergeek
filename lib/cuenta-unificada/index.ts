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
  CuentaUnificadaServicio,
  GetCuentaUnificadaInput,
} from "@/types/cuenta-unificada";

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

// Repuestos "de stock" en modo V2: hoy no existe ningún link directo entre
// Shipping Items y Órdenes de Reparación (confirmado en la auditoría Fase 11),
// así que no hay nada que leer todavía. La Etapa 2 crea ese campo/UI; cuando
// exista, este stub se reemplaza por el fetch real (mismo patrón que
// fetchItemPedido: leer el campo inverso de IDs + fetchRecordsByIds).
async function fetchRepuestosStockV2(): Promise<CuentaUnificadaItem[]> {
  return [];
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
  const modoRepuestos = ordenRecord ? resolveModoRepuestos(ordenRecord.createdTime ?? "") : null;

  // Si hay operación vinculada, el repuesto entra a la cuenta por su lado
  // (Σ Precio venta final de items de la operación) y la orden NO aporta
  // repuestos propios — evita el doble conteo detectado en la auditoría
  // (renglón legacy en "Repuestos por Orden" + item real de la operación
  // describiendo el mismo repuesto físico). El modo Legacy/V2 solo decide de
  // dónde salen los repuestos de STOCK de la orden, y eso solo aplica cuando
  // la orden no tiene operación vinculada.
  const ordenAportaRepuestosPropios = ordenId != null && operacionId == null;

  const [servicios, repuestosLegacy, repuestosStockV2, abonosOrden, itemsPedido, abonosOperacion] =
    await Promise.all([
      ordenId ? fetchServiciosPorOrden(ordenId) : Promise.resolve([]),
      ordenAportaRepuestosPropios && modoRepuestos === "legacy"
        ? fetchRepuestosPorOrden(ordenId!)
        : Promise.resolve([]),
      ordenAportaRepuestosPropios && modoRepuestos === "v2"
        ? fetchRepuestosStockV2()
        : Promise.resolve([]),
      ordenId ? fetchAbonosPorOrden(ordenId) : Promise.resolve([]),
      operacionRecord ? fetchItemsPedido(operacionRecord, client) : Promise.resolve([]),
      operacionRecord ? fetchAbonosOperacion(operacionRecord, client) : Promise.resolve([]),
    ]);

  const items: CuentaUnificadaItem[] = [
    ...itemsPedido,
    ...repuestosStockV2,
    ...repuestosLegacy.map((r): CuentaUnificadaItem => {
      const precio =
        r.subtotalCliente ?? (r.cantidad != null && r.precioCliente != null ? r.cantidad * r.precioCliente : r.precioCliente ?? 0);
      return {
        id: r.id,
        nombre: r.repuestoNombre,
        origen: "legacy",
        precio,
        // El modelo legacy no tiene concepto de "cubierto": la orden siempre
        // cobra el repuesto completo, igual que hoy.
        cubierto: 0,
        saldo: precio,
      };
    }),
  ];

  const serviciosMapped: CuentaUnificadaServicio[] = servicios.map((s) => ({
    id: s.id,
    nombre: s.servicioNombre,
    costo: s.costo ?? 0,
  }));

  const abonos: CuentaUnificadaAbono[] = [
    ...abonosOrden.map(
      (a): CuentaUnificadaAbono => ({
        id: a.id,
        idAbono: a.idAbono,
        fecha: a.fecha,
        monto: a.monto ?? 0,
        metodoPago: a.metodoPago,
        estado: a.estado,
        origen: "orden",
        observacion: a.observacion,
      })
    ),
    ...abonosOperacion,
  ].sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? ""));

  const totalCuenta =
    items.reduce((sum, item) => sum + item.precio, 0) +
    serviciosMapped.reduce((sum, s) => sum + s.costo, 0);
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
    abonos,
    totalCuenta,
    totalAbonado,
    saldo,
  };
}

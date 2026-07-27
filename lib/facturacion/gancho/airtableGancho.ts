import "server-only";

// Lecturas de Airtable propias del gancho — deliberadamente separadas de
// lib/cuenta-unificada/index.ts (que no expone cliente, ni los campos de
// Shipping Items que necesita la precondición dura, ni el campo inverso de
// facturas) para no tocar ese módulo compartido, ya en producción, fuera de
// lo que pide esta PR.
//
// Regla de la casa: nunca filtrar por campo de link — se leen los IDs del
// campo inverso ya presentes en el registro y se hace fetch por RECORD_ID().

const ORDENES_TABLE   = "Órdenes de Reparación";
const OPERACIONES_TABLE = "Operación Comercial";
const RESERVAS_TABLE  = "Reservas";
const CLIENTES_TABLE  = "Clientes";
const SHIPPING_ITEMS_TABLE = "Shipping Items";
const FACTURAS_TABLE  = "Facturas Electrónicas";

export type AirtableRecord = {
  id: string;
  fields: Record<string, unknown>;
};

type AirtableClient = {
  baseUrl: string;
  headers: HeadersInit;
};

function getClient(): AirtableClient {
  const token  = process.env.AIRTABLE_API_KEY?.trim();
  const baseId = process.env.AIRTABLE_BASE_ID?.trim();
  if (!token)  throw new Error("Falta AIRTABLE_API_KEY en .env.local.");
  if (!baseId) throw new Error("Falta AIRTABLE_BASE_ID en .env.local.");
  return {
    baseUrl: `https://api.airtable.com/v0/${baseId}`,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  };
}

export async function fetchRecord(table: string, id: string): Promise<AirtableRecord | null> {
  const client = getClient();
  const res = await fetch(`${client.baseUrl}/${encodeURIComponent(table)}/${encodeURIComponent(id)}`, {
    headers: client.headers,
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as AirtableRecord;
}

export async function fetchRecordsByIds(table: string, ids: string[]): Promise<AirtableRecord[]> {
  if (ids.length === 0) return [];
  const formula =
    ids.length === 1
      ? `RECORD_ID()='${ids[0]}'`
      : `OR(${ids.map((id) => `RECORD_ID()='${id}'`).join(",")})`;
  const client = getClient();
  const url = new URL(`${client.baseUrl}/${encodeURIComponent(table)}`);
  url.searchParams.set("filterByFormula", formula);
  url.searchParams.set("pageSize", "100");
  const res = await fetch(url.toString(), { headers: client.headers, cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as { records?: AirtableRecord[] };
  return data.records ?? [];
}

export function linkedIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim() !== "");
}

export function firstString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

// ─── Fetchers específicos ─────────────────────────────────────────────────────

export async function fetchOrden(ordenId: string) {
  return fetchRecord(ORDENES_TABLE, ordenId);
}

export async function fetchOperacion(operacionId: string) {
  return fetchRecord(OPERACIONES_TABLE, operacionId);
}

export async function fetchReserva(reservaId: string) {
  return fetchRecord(RESERVAS_TABLE, reservaId);
}

export async function fetchCliente(clienteId: string) {
  return fetchRecord(CLIENTES_TABLE, clienteId);
}

export type ItemDetalleGancho = {
  id: string;
  sku: string;
  reservado: boolean;
  tieneFacturaPrevia: boolean;
  tarifaIva: string; // "15%" | "0%" | "Exento" | "No objeto" | "" (vacío)
  // Fase 17.b (inventario por cantidad): unidades en stock según el campo
  // "Cantidad" de Shipping Items. Campo vacío/ausente → 0, fail-closed:
  // un item sin cantidad definida se trata como sin stock, nunca al revés.
  cantidad: number;
};

export function numberOrZero(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = parseFloat(String(value));
  return Number.isFinite(n) ? n : 0;
}

export async function fetchDetalleItems(itemIds: string[]): Promise<Map<string, ItemDetalleGancho>> {
  const records = await fetchRecordsByIds(SHIPPING_ITEMS_TABLE, itemIds);
  const map = new Map<string, ItemDetalleGancho>();
  for (const r of records) {
    map.set(r.id, {
      id: r.id,
      sku: firstString(r.fields["SKU"]),
      reservado: r.fields["Reservado"] === true,
      tieneFacturaPrevia: linkedIds(r.fields["Factura"]).length > 0,
      tarifaIva: firstString(r.fields["Tarifa IVA"]),
      cantidad: numberOrZero(r.fields["Cantidad"]),
    });
  }
  return map;
}

export type FacturaVinculadaGancho = {
  recordId: string;
  numeroFactura: string;
  estado: string;
  claveAcceso: string;
};

export async function fetchFacturasVinculadas(facturaIds: string[]): Promise<FacturaVinculadaGancho[]> {
  const records = await fetchRecordsByIds(FACTURAS_TABLE, facturaIds);
  return records.map((r) => ({
    recordId:      r.id,
    numeroFactura: firstString(r.fields["Número de Factura"]),
    estado:        firstString(r.fields["Estado"]),
    claveAcceso:   firstString(r.fields["Clave de Acceso"]),
  }));
}

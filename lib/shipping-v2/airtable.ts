import "server-only";

import type {
  ShippingV2DashboardSummary,
  ShippingV2Item,
  ShippingV2Novedad,
  ShippingV2Packing,
  ShippingV2Pago,
  ShippingV2Proveedor,
  ShippingV2Recepcion,
} from "@/types/shipping-v2";
import { SHIPPING_V2_TABLES } from "@/lib/shipping-v2/table-names";

type AirtableRecord = {
  id: string;
  createdTime?: string;
  fields: Record<string, unknown>;
};

type AirtableListResponse = {
  records?: AirtableRecord[];
  offset?: string;
};

function getRequiredEnv(name: "AIRTABLE_API_KEY" | "AIRTABLE_BASE_ID") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta ${name}. Definir en .env.local para habilitar Shipping.`);
  return value;
}

function getClient() {
  const baseId = getRequiredEnv("AIRTABLE_BASE_ID");

  return {
    baseUrl: `https://api.airtable.com/v0/${baseId}`,
    headers: {
      Authorization: `Bearer ${getRequiredEnv("AIRTABLE_API_KEY")}`,
      "Content-Type": "application/json",
    },
  };
}

function tableUrl(tableName: string) {
  return `${getClient().baseUrl}/${encodeURIComponent(tableName)}`;
}

function firstString(value: unknown, fallback = "") {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) {
    const found = value.find((item) => typeof item === "string" || typeof item === "number");
    return found === undefined ? fallback : String(found);
  }
  return fallback;
}

function firstNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim().replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function linkedCount(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function normalizeStatus(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

async function airtableRequest<T>(url: string) {
  const response = await fetch(url, {
    headers: getClient().headers,
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable Shipping V2 error ${response.status}: ${text}`);
  }

  return (await response.json()) as T;
}

async function listRecords(tableName: string, options: { maxRecords?: number; pageSize?: number; sortField?: string; sortDirection?: "asc" | "desc" } = {}) {
  const records: AirtableRecord[] = [];
  let offset: string | null = null;

  do {
    const url = new URL(tableUrl(tableName));
    url.searchParams.set("pageSize", String(options.pageSize ?? 100));
    if (options.maxRecords) url.searchParams.set("maxRecords", String(options.maxRecords));
    if (options.sortField) {
      url.searchParams.append("sort[0][field]", options.sortField);
      url.searchParams.append("sort[0][direction]", options.sortDirection ?? "desc");
    }
    if (offset) url.searchParams.set("offset", offset);

    const data = await airtableRequest<AirtableListResponse>(url.toString());
    records.push(...(data.records ?? []));
    offset = data.offset ?? null;
  } while (offset && (!options.maxRecords || records.length < options.maxRecords));

  return options.maxRecords ? records.slice(0, options.maxRecords) : records;
}

function mapProveedor(record: AirtableRecord): ShippingV2Proveedor {
  const f = record.fields;
  return {
    id: record.id,
    createdTime: record.createdTime,
    nombre: firstString(f.Nombre ?? f.Proveedor, record.id),
    estado: firstString(f.Estado, "Activo"),
    contacto: firstString(f.Contacto),
    email: firstString(f.Email),
    telefono: firstString(f.Telefono ?? f["Teléfono"]),
    pais: firstString(f.Pais ?? f["País"]),
  };
}

function mapItem(record: AirtableRecord): ShippingV2Item {
  const f = record.fields;
  return {
    id: record.id,
    createdTime: record.createdTime,
    codigo: firstString(f.Codigo ?? f["Código"], record.id),
    nombre: firstString(f.Item ?? f.Nombre, "Sin item"),
    estado: firstString(f.Estado, "Borrador"),
    proveedorId: firstString(f.Proveedor),
    proveedorNombre: firstString(f["Nombre Proveedor"] ?? f["Proveedor Nombre"]),
    costoProveedor: firstNumber(f["Costo Proveedor"] ?? f.Costo),
    precioVenta: firstNumber(f["Precio Venta"]),
    qty: firstNumber(f.Qty ?? f.Cantidad),
    trackingUsa: firstString(f["USA Tracking"] ?? f.TrackingUSA),
    trackingEc: firstString(f["EC Tracking"] ?? f.TrackingEC),
    packingId: firstString(f.Packing),
    pagoId: firstString(f.Pago),
  };
}

function mapPago(record: AirtableRecord): ShippingV2Pago {
  const f = record.fields;
  return {
    id: record.id,
    createdTime: record.createdTime,
    pagoId: firstString(f["Pago ID"] ?? f.Pago, record.id),
    estado: firstString(f.Estado ?? f["Estado de Pago"], "Pendiente"),
    proveedorId: firstString(f.Proveedor),
    proveedorNombre: firstString(f["Nombre Proveedor"] ?? f["Proveedor Nombre"]),
    total: firstNumber(f.Total ?? f["Total Pago"]),
    fechaPagoMax: firstString(f["Fecha de Pago Max"] ?? f["Fecha de Pago Máx"]),
    fechaPagoReal: firstString(f["Fecha de Pago Real"]),
    metodoPago: firstString(f["Metodo de Pago"] ?? f["Método de Pago"]),
    transaccionId: firstString(f["Transaccion ID"] ?? f["Transacción ID"]),
  };
}

function mapPacking(record: AirtableRecord): ShippingV2Packing {
  const f = record.fields;
  return {
    id: record.id,
    createdTime: record.createdTime,
    packingId: firstString(f.Packing ?? f.Pack, record.id),
    estado: firstString(f.Estado, "En Proceso"),
    tipo: firstString(f.Tipo),
    itemCount: linkedCount(f.Items ?? f.Item),
    peso: firstNumber(f["Peso (Kilos)"] ?? f.Peso),
    trackingUsa: firstString(f["USA Tracking"] ?? f.TrackingUSA),
    trackingEc: firstString(f["EC Tracking"] ?? f.TrackingEC),
    fechaEnvio: firstString(f["Fecha Envio"] ?? f["Fecha Envío"]),
    arriboEstimado: firstString(f["Arribo Estimado"]),
  };
}

function mapRecepcion(record: AirtableRecord): ShippingV2Recepcion {
  const f = record.fields;
  return {
    id: record.id,
    createdTime: record.createdTime,
    recepcionId: firstString(f.Recepcion ?? f["Recepción"], record.id),
    estado: firstString(f.Estado, "Pendiente"),
    packingId: firstString(f.Packing),
    fechaRecepcion: firstString(f["Fecha Recepcion"] ?? f["Fecha Recepción"]),
    itemsRecibidos: firstNumber(f["Items Recibidos"]) ?? linkedCount(f.Items ?? f.Item),
    observacion: firstString(f.Observacion ?? f["Observación"]),
  };
}

function mapNovedad(record: AirtableRecord): ShippingV2Novedad {
  const f = record.fields;
  return {
    id: record.id,
    createdTime: record.createdTime,
    titulo: firstString(f.Titulo ?? f["Título"] ?? f.Novedad, "Sin titulo"),
    estado: firstString(f.Estado, "Abierta"),
    severidad: firstString(f.Severidad),
    itemId: firstString(f.Item),
    packingId: firstString(f.Packing),
    descripcion: firstString(f.Descripcion ?? f["Descripción"]),
  };
}

export async function getShippingV2Proveedores() {
  const records = await listRecords(SHIPPING_V2_TABLES.proveedores, { maxRecords: 100 });
  return records.map(mapProveedor);
}

export async function getShippingV2Items() {
  const records = await listRecords(SHIPPING_V2_TABLES.items, { maxRecords: 200 });
  return records.map(mapItem);
}

export async function getShippingV2Pagos() {
  const records = await listRecords(SHIPPING_V2_TABLES.pagos, { maxRecords: 200 });
  return records.map(mapPago);
}

export async function getShippingV2Packings() {
  const records = await listRecords(SHIPPING_V2_TABLES.packings, { maxRecords: 200 });
  return records.map(mapPacking);
}

export async function getShippingV2Recepciones() {
  const records = await listRecords(SHIPPING_V2_TABLES.recepciones, { maxRecords: 200 });
  return records.map(mapRecepcion);
}

export async function getShippingV2Novedades() {
  const records = await listRecords(SHIPPING_V2_TABLES.novedades, { maxRecords: 200 });
  return records.map(mapNovedad);
}

export async function getShippingV2DashboardSummary(): Promise<ShippingV2DashboardSummary> {
  const [items, pagos, packings, novedades] = await Promise.all([
    getShippingV2Items(),
    getShippingV2Pagos(),
    getShippingV2Packings(),
    getShippingV2Novedades(),
  ]);

  return {
    totalItems: items.length,
    itemsPendientesPago: items.filter((item) => normalizeStatus(item.estado).includes("pendiente pago")).length,
    itemsEnTransito: items.filter((item) => normalizeStatus(item.estado).includes("transito")).length,
    itemsDisponibles: items.filter((item) => normalizeStatus(item.estado).includes("disponible")).length,
    pagosPendientes: pagos.filter((pago) => normalizeStatus(pago.estado).includes("pendiente")).length,
    packingsEnProceso: packings.filter((packing) => normalizeStatus(packing.estado).includes("proceso")).length,
    packingsEnTransito: packings.filter((packing) => normalizeStatus(packing.estado).includes("transito")).length,
    novedadesAbiertas: novedades.filter((novedad) => ["abierta", "en revision"].includes(normalizeStatus(novedad.estado))).length,
  };
}

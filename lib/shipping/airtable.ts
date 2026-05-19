import "server-only";

import { SHIPPING_PACKING_STATUSES } from "@/types/shipping";
import type {
  ShippingAttachmentInput,
  ShippingCreatePackingResult,
  ShippingDashboardPendingWork,
  ShippingDashboardSummary,
  ShippingItem,
  ShippingNewPackingInput,
  ShippingNewItemInput,
  ShippingPacking,
  ShippingPackingAvailableItem,
  ShippingPackingDetail,
  ShippingPackingItem,
  ShippingPackingLogisticsInput,
  ShippingPaymentRegistrationInput,
  ShippingPaymentRegistrationResult,
  ShippingPaymentPreparationPreview,
  ShippingPaymentLinkResult,
  ShippingPaymentPreviewGroup,
  ShippingPendingPaymentItem,
  ShippingPago,
  ShippingProveedor,
  ShippingQuickPackingInput,
} from "@/types/shipping";

type AirtableRecord = {
  id: string;
  fields: Record<string, unknown>;
};

type AirtableListResponse = {
  records?: AirtableRecord[];
  offset?: string;
};

type AirtablePatchResponse = {
  records?: AirtableRecord[];
};

const SHIPPING_TABLES = {
  item: process.env.AIRTABLE_ITEM_TABLE?.trim() || "Item",
  pago: process.env.AIRTABLE_PAGO_TABLE?.trim() || "Pago",
  packing: process.env.AIRTABLE_PACKING_TABLE?.trim() || "Packing",
  proveedores: process.env.AIRTABLE_PROVEEDORES_TABLE?.trim() || "Proveedores",
} as const;

// Futuro: mover a configuración cuando el flujo de pagos Shipping esté estable.
export const SHIPPING_PAYMENTS_START_DATE = "2026-05-15";

function getRequiredEnv(name: "AIRTABLE_API_KEY" | "AIRTABLE_BASE_ID") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta ${name}. Definir en .env.local.`);
  return value;
}

function getClient() {
  const token =
    process.env.AIRTABLE_COTIZACIONES_TOKEN?.trim() ||
    process.env.AIRTABLE_ADM_TOKEN?.trim() ||
    getRequiredEnv("AIRTABLE_API_KEY");
  const baseId =
    process.env.AIRTABLE_COTIZACIONES_BASE_ID?.trim() ||
    process.env.AIRTABLE_ADM_BASE_ID?.trim() ||
    getRequiredEnv("AIRTABLE_BASE_ID");

  return {
    baseId,
    baseUrl: `https://api.airtable.com/v0/${baseId}`,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };
}

function tableUrl(tableName: string) {
  return `${getClient().baseUrl}/${encodeURIComponent(tableName)}`;
}

function escapeAirtableFormulaString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
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

function isAirtableRecordId(value: string) {
  return /^rec[a-zA-Z0-9]{14}$/.test(value);
}

function getUniqueReadableValues(value: unknown) {
  const values: string[] = [];

  function collect(item: unknown) {
    if (item === null || item === undefined) return;
    if (Array.isArray(item)) {
      for (const child of item) collect(child);
      return;
    }

    if (typeof item === "object") {
      const objectValue = item as { name?: unknown; id?: unknown };
      collect(objectValue.name);
      return;
    }

    if (typeof item === "number" && Number.isFinite(item)) {
      values.push(String(item));
      return;
    }

    if (typeof item !== "string") return;

    for (const part of item.split(",")) {
      const cleaned = part.trim();
      if (!cleaned || isAirtableRecordId(cleaned)) continue;
      values.push(cleaned);
    }
  }

  collect(value);

  const uniqueValues: string[] = [];
  const seen = new Set<string>();
  for (const valueItem of values) {
    const key = valueItem.normalize("NFC").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueValues.push(valueItem);
  }

  return uniqueValues;
}

function uniqueReadableString(value: unknown, fallback = "") {
  const values = getUniqueReadableValues(value);
  return values.length ? values.join(", ") : fallback;
}

function firstNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim().replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function boolValue(value: unknown) {
  return value === true;
}

function hasFilledValue(value: unknown) {
  if (value === true) return true;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length > 0;
  return false;
}

function linkedCount(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function hasLinkedValue(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  return firstString(value).trim().length > 0;
}

function formatGroupDate(value: string) {
  const date = value ? new Date(value) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(safeDate);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";

  return `${year}${month}${day}`;
}

function getServerDateGroupKey() {
  return formatGroupDate(new Date().toISOString());
}

function dateKeyFromValue(value: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return formatGroupDate(value);
}

function formatGroupDateLabel(dateKey: string) {
  if (!/^\d{8}$/.test(dateKey)) return dateKey;
  return `${dateKey.slice(0, 4)}-${dateKey.slice(4, 6)}-${dateKey.slice(6, 8)}`;
}

export function normalizeText(value: unknown) {
  return firstString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function isPaidStatus(value: unknown) {
  const normalized = normalizeText(value);
  if (!normalized) return false;

  // Airtable puede exponer el estado como texto libre o single select.
  // Por ahora consideramos pagado solo estados explícitos para no marcar
  // como pagado un item cancelado, anulado o pendiente por error.
  return normalized === "pagado" || normalized === "pago realizado" || normalized === "paid";
}

export function isPackingInPreparation(value: unknown) {
  const normalized = normalizeText(value);
  return normalized.includes("preparacion") || normalized.includes("preparando") || normalized.includes("pendiente");
}

export function isPackingSent(value: unknown) {
  const normalized = normalizeText(value);
  return normalized.includes("enviado") || normalized.includes("transito") || normalized.includes("transit");
}

export function isPackingReceived(value: unknown) {
  const normalized = normalizeText(value);
  return normalized.includes("recibido") || normalized.includes("entregado") || normalized.includes("delivered");
}

export function itemNeedsPayment(item: ShippingItem) {
  // Regla operativa simple: falta pago si no hay Pago vinculado o si el
  // Estado Pago no dice claramente que ya está pagado.
  return item.pagoCount === 0 || !isPaidStatus(item.estadoPago);
}

export function itemPaidWithoutPacking(item: ShippingItem) {
  return (item.pagoCount > 0 || isPaidStatus(item.estadoPago)) && item.packingCount === 0;
}

export function normalizarProveedorParaPagoId(proveedor: string) {
  const normalized = proveedor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "SIN-PROVEEDOR";
}

function normalizeProveedorForPagoId(proveedor: string) {
  return normalizarProveedorParaPagoId(proveedor);
}

export function generarPagoIdShipping(fechaGrupo: string, proveedor: string) {
  return `PAY-${fechaGrupo}-${normalizarProveedorParaPagoId(proveedor)}`;
}

async function airtableRequest<T>(url: string, init: RequestInit = {}) {
  const client = getClient();
  const response = await fetch(url, {
    ...init,
    headers: client.headers,
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable Shipping error ${response.status}: ${text}`);
  }

  return (await response.json()) as T;
}

async function uploadAttachmentToRecord({
  recordId,
  attachmentFieldName,
  filename,
  contentType,
  fileBase64,
}: ShippingAttachmentInput & { recordId: string; attachmentFieldName: string }) {
  const client = getClient();
  const response = await fetch(
    `https://content.airtable.com/v0/${encodeURIComponent(client.baseId)}/${encodeURIComponent(recordId)}/${encodeURIComponent(attachmentFieldName)}/uploadAttachment`,
    {
      method: "POST",
      headers: client.headers,
      body: JSON.stringify({
        contentType,
        filename,
        file: fileBase64,
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable uploadAttachment error ${response.status}: ${text}`);
  }
}

async function listRecords(
  tableName: string,
  options: { pageSize?: number; maxRecords?: number; sortField?: string; sortDirection?: "asc" | "desc"; filterByFormula?: string; fields?: string[] } = {}
) {
  const records: AirtableRecord[] = [];
  let offset: string | null = null;

  do {
    const url = new URL(tableUrl(tableName));
    url.searchParams.set("pageSize", String(options.pageSize ?? 100));
    if (options.maxRecords) url.searchParams.set("maxRecords", String(options.maxRecords));
    if (options.filterByFormula) url.searchParams.set("filterByFormula", options.filterByFormula);
    for (const field of options.fields ?? []) {
      url.searchParams.append("fields[]", field);
    }
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

async function patchRecord(tableName: string, recordId: string, fields: Record<string, unknown>) {
  return airtableRequest<AirtableRecord>(`${tableUrl(tableName)}/${encodeURIComponent(recordId)}`, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  });
}

async function patchRecordBatch(tableName: string, recordId: string, fields: Record<string, unknown>) {
  const data = await airtableRequest<AirtablePatchResponse>(tableUrl(tableName), {
    method: "PATCH",
    body: JSON.stringify({
      records: [{ id: recordId, fields }],
      typecast: true,
    }),
  });

  return data.records?.[0] ?? null;
}

function mapItem(record: AirtableRecord): ShippingItem {
  const f = record.fields;
  const pagoField = f["Pago"] ?? f["Pagos"] ?? f["Pago ID"];
  const packingField = f["Packing"] ?? f["Pack"];
  return {
    id: record.id,
    codigo: firstString(f["Código"], record.id),
    item: firstString(f["Item"], "Sin item"),
    categoria: firstString(f["Categoria"]),
    itemPara: firstString(f["Item Para"]),
    proveedor: firstString(f["Nombre Proveedor"]) || firstString(f["Proveedor"]),
    costoProveedor: firstNumber(f["Costo Proveedor"]),
    precioVenta: firstNumber(f["Precio Venta"]),
    qty: firstNumber(f["Qty"]),
    peso: firstNumber(f["Peso (Kilos)"]),
    estadoPago: firstString(f["Estado Pago"]) || firstString(f["Estado de Pago"]),
    estadoEmpaque: firstString(f["Estado Empaque"]),
    pago: firstString(pagoField),
    pagoCount: hasLinkedValue(pagoField) ? Math.max(1, linkedCount(pagoField)) : 0,
    packing: firstString(packingField),
    packingCount: hasLinkedValue(packingField) ? Math.max(1, linkedCount(packingField)) : 0,
    usaTracking: firstString(f["USA Tracking"]),
    ecTracking: firstString(f["EC Tracking"]),
    carrier: firstString(f["Carrier"]),
    notaInterna: firstString(f["Nota Interna"]),
    notaPublica: firstString(f["Nota Pública"]),
    regalo: boolValue(f["Regalo"]),
    encargo: boolValue(f["Encargo"]),
    fechaOfertado: firstString(f["Fecha Ofertado"]),
  };
}

function mapPendingPaymentItem(record: AirtableRecord): ShippingPendingPaymentItem | null {
  const f = record.fields;
  const pagoField = f["Pago"] ?? f["Pagos"] ?? f["Pago ID"];
  const proveedor = firstString(f["Nombre Proveedor"]) || firstString(f["Proveedor"]);
  const costoProveedor = firstNumber(f["Costo Proveedor"]);
  const estadoPago = firstString(f["Estado Pago"]) || firstString(f["Estado de Pago"]);
  const fechaOfertado = firstString(f["Fecha Ofertado"]);

  if (!proveedor) return null;
  if (costoProveedor !== null && costoProveedor < 0) return null;
  if (hasLinkedValue(pagoField)) return null;
  if (isPaidStatus(estadoPago)) return null;

  return {
    id: record.id,
    codigo: firstString(f["Código"], record.id),
    item: firstString(f["Item"], "Sin item"),
    proveedor,
    fechaOfertado,
    fechaGrupo: dateKeyFromValue(fechaOfertado) ?? "SIN-FECHA",
    costoProveedor,
    regalo: boolValue(f["Regalo"]),
  };
}

function mapPago(record: AirtableRecord): ShippingPago {
  const f = record.fields;
  const pagoRealizadoValue = f["Pago Realizado"];
  const proveedor =
    firstString(f["Proveedor Único"]) ||
    uniqueReadableString(f["Proveedor (from Items)"]) ||
    uniqueReadableString(f["Nombre Proveedor"]) ||
    uniqueReadableString(f["Proveedor"]);
  return {
    id: record.id,
    pagoId: firstString(f["Pago ID"], record.id),
    totalPago: firstNumber(f["Total Pago"]),
    fechaPagoMax: firstString(f["Fecha de Pago Máx"]),
    transaccionId: firstString(f["Transacción ID"]),
    proveedor,
    pagoRealizado: hasFilledValue(pagoRealizadoValue),
    pagoRealizadoValor: firstString(pagoRealizadoValue),
    estadoPago: firstString(f["Estado de Pago"]),
    recargosPagoExterior: firstNumber(f["Recargos Pago Exterior"]),
    fechaPagoReal: firstString(f["Fecha de Pago Real"]),
    metodoPago: firstString(f["Método de Pago"]),
    cuentaOrigen: firstString(f["Cuenta Origen"]),
    observacion: firstString(f["Observación"]),
    registradoPor: firstString(f["Registrado por"]),
    movimientoFinanzasId: firstString(f["Movimiento Finanzas ID"]),
    estadoIntegracionFinanzas: firstString(f["Estado Integración Finanzas"]),
    comprobanteCount: linkedCount(f["Comprobante"]),
    itemCount: linkedCount(f["Items"] ?? f["Item"]),
  };
}

function mapPacking(record: AirtableRecord): ShippingPacking {
  const f = record.fields;
  const itemIds = linkedRecordIds(f["Items"]);
  return {
    id: record.id,
    pack: firstString(f["Pack"], record.id),
    tipo: firstString(f["Tipo"]),
    estado: firstString(f["Estado"]),
    items: itemIds.length === 1 ? "1 item" : itemIds.length > 1 ? `${itemIds.length} items` : "-",
    itemIds,
    itemCount: itemIds.length,
    costoTotalItems: firstNumber(f["Costo Total Items"]),
    peso: firstNumber(f["Peso (Kilos)"]),
    usaTracking: firstString(f["USA Tracking"]),
    ecTracking: firstString(f["EC Tracking"]),
    fechaEnvio: firstString(f["Fecha Envío"]),
    arriboEstimado: firstString(f["Arribo Estimado"]),
    fleteEc: firstNumber(f["Flete EC"]),
    arancel: firstNumber(f["Arancel"]),
    qtyRegalos: firstNumber(f["Qty Regalos"]),
    qtyEncargos: firstNumber(f["Qty Encargos"]),
  };
}

function mapPackingItem(record: AirtableRecord): ShippingPackingItem {
  const item = mapItem(record);
  return {
    id: item.id,
    codigo: item.codigo,
    item: item.item,
    proveedor: item.proveedor,
    costoProveedor: item.costoProveedor,
    peso: item.peso,
    regalo: item.regalo,
    encargo: item.encargo,
    usaTracking: item.usaTracking,
    estadoPago: item.estadoPago,
    estadoEmpaque: item.estadoEmpaque,
    packingIds: linkedRecordIds(record.fields.Packing),
  };
}

function mapProveedor(record: AirtableRecord): ShippingProveedor {
  const f = record.fields;
  return {
    id: record.id,
    nombre: firstString(f["Nombre"], record.id),
    direccion: firstString(f["Dirección"]),
    comprasTotales: firstNumber(f["Compras Totales"]),
    itemsRelacionados: linkedCount(f["Item"]),
  };
}

export async function obtenerShippingItemsRecientes(limit = 50) {
  const records = await listRecords(SHIPPING_TABLES.item, {
    maxRecords: limit,
    sortField: "Fecha Ofertado",
    sortDirection: "desc",
  });
  return records.map(mapItem);
}

export async function obtenerShippingPagosRecientes(limit = 50) {
  const records = await listRecords(SHIPPING_TABLES.pago, {
    maxRecords: limit,
    sortField: "Fecha de Pago Máx",
    sortDirection: "desc",
    fields: [
      "Pago ID",
      "Items",
      "Total Pago",
      "Transacción ID",
      "Pago Realizado",
      "Estado de Pago",
      "Recargos Pago Exterior",
      "Fecha de Pago Máx",
      "Fecha de Pago Real",
      "Método de Pago",
      "Cuenta Origen",
      "Comprobante",
      "Observación",
      "Registrado por",
      "Movimiento Finanzas ID",
      "Estado Integración Finanzas",
      "Proveedor Único",
      "Proveedor (from Items)",
    ],
  });
  return records.map(mapPago);
}

export async function obtenerShippingPagoPorId(recordId: string) {
  const record = await airtableRequest<AirtableRecord>(`${tableUrl(SHIPPING_TABLES.pago)}/${encodeURIComponent(recordId)}`);
  return mapPago(record);
}

export async function obtenerShippingPagoRecordPorId(recordId: string) {
  return airtableRequest<AirtableRecord>(`${tableUrl(SHIPPING_TABLES.pago)}/${encodeURIComponent(recordId)}`);
}

export async function obtenerShippingPackingsRecientes(limit = 50) {
  const records = await listRecords(SHIPPING_TABLES.packing, {
    maxRecords: limit,
    sortField: "Fecha Envío",
    sortDirection: "desc",
  });
  return records.map(mapPacking);
}

function recordIdFilter(recordIds: string[]) {
  if (recordIds.length === 1) return `RECORD_ID() = '${escapeAirtableFormulaString(recordIds[0])}'`;
  return `OR(${recordIds.map((id) => `RECORD_ID() = '${escapeAirtableFormulaString(id)}'`).join(", ")})`;
}

async function obtenerShippingItemsPorIds(recordIds: string[]) {
  if (recordIds.length === 0) return [];

  const records = await listRecords(SHIPPING_TABLES.item, {
    maxRecords: recordIds.length,
    filterByFormula: recordIdFilter(recordIds),
    fields: [
      "Código",
      "Item",
      "Nombre Proveedor",
      "Proveedor",
      "Costo Proveedor",
      "Peso (Kilos)",
      "Regalo",
      "Encargo",
      "USA Tracking",
      "EC Tracking",
      "Carrier",
      "Pago",
      "Estado Pago",
      "Packing",
      "Estado Empaque",
      "Fecha Ofertado",
    ],
  });

  return records.map(mapPackingItem);
}

export async function obtenerShippingPackingPorId(recordId: string) {
  const record = await airtableRequest<AirtableRecord>(`${tableUrl(SHIPPING_TABLES.packing)}/${encodeURIComponent(recordId)}`);
  return mapPacking(record);
}

export async function obtenerEstadosPackingExistentes(limit = 500) {
  const records = await listRecords(SHIPPING_TABLES.packing, {
    maxRecords: limit,
    fields: ["Estado"],
  });

  return Array.from(new Set(records.map((record) => firstString(record.fields.Estado)).filter(Boolean))).sort((a, b) => a.localeCompare(b, "es"));
}

export async function obtenerShippingPackingDetalle(recordId: string): Promise<ShippingPackingDetail> {
  const [packing, availableItems, existingStatuses] = await Promise.all([
    obtenerShippingPackingPorId(recordId),
    obtenerItemsDisponiblesParaPacking(500),
    obtenerEstadosPackingExistentes(500),
  ]);
  const items = await obtenerShippingItemsPorIds(packing.itemIds);
  const missingStatuses = SHIPPING_PACKING_STATUSES.filter((status) => !existingStatuses.includes(status));

  return {
    packing,
    items,
    availableItems,
    existingStatuses,
    missingStatuses,
  };
}

function isItemAvailableForPacking(item: ShippingItem) {
  return item.pagoCount > 0 && isPaidStatus(item.estadoPago) && item.packingCount === 0 && !isPackingReceived(item.estadoEmpaque);
}

export async function obtenerItemsDisponiblesParaPacking(limit = 500): Promise<ShippingPackingAvailableItem[]> {
  const records = await listRecords(SHIPPING_TABLES.item, {
    maxRecords: limit,
    sortField: "Fecha Ofertado",
    sortDirection: "desc",
    fields: [
      "Código",
      "Item",
      "Nombre Proveedor",
      "Proveedor",
      "Costo Proveedor",
      "Peso (Kilos)",
      "Regalo",
      "Encargo",
      "USA Tracking",
      "EC Tracking",
      "Carrier",
      "Pago",
      "Estado Pago",
      "Packing",
      "Estado Empaque",
      "Fecha Ofertado",
    ],
  });

  return records.map(mapItem).filter(isItemAvailableForPacking).map((item) => ({
    id: item.id,
    codigo: item.codigo,
    item: item.item,
    proveedor: item.proveedor,
    costoProveedor: item.costoProveedor,
    peso: item.peso,
    regalo: item.regalo,
    encargo: item.encargo,
    usaTracking: item.usaTracking,
    estadoPago: item.estadoPago,
    estadoEmpaque: item.estadoEmpaque,
  }));
}

async function patchEditablePackingFields(packingRecordId: string, fields: Record<string, unknown>) {
  const writtenFields: string[] = [];
  const warnings: string[] = [];

  for (const [fieldName, value] of Object.entries(fields)) {
    if (value === "" || value === null || value === undefined) continue;

    try {
      await patchRecordBatch(SHIPPING_TABLES.packing, packingRecordId, { [fieldName]: value });
      writtenFields.push(fieldName);
    } catch (error) {
      warnings.push(`No se pudo escribir ${fieldName}: ${error instanceof Error ? error.message : "campo no editable"}.`);
    }
  }

  return { writtenFields, warnings };
}

export async function crearShippingPacking(input: ShippingNewPackingInput): Promise<ShippingCreatePackingResult> {
  const created = await airtableRequest<AirtableRecord>(tableUrl(SHIPPING_TABLES.packing), {
    method: "POST",
    body: JSON.stringify({
      fields: {
        Items: input.itemIds,
      },
      typecast: true,
    }),
  });

  const editableFields: Record<string, unknown> = {
    Tipo: input.tipo,
    Estado: input.estado || "En preparación",
    "Peso (Kilos)": input.peso,
    "USA Tracking": input.usaTracking,
    "EC Tracking": input.ecTracking,
    "Fecha Envío": input.fechaEnvio,
    "Arribo Estimado": input.arriboEstimado,
    "Flete EC": input.fleteEc,
    Arancel: input.arancel,
  };

  const patchResult = await patchEditablePackingFields(created.id, editableFields);
  const warnings = [...patchResult.warnings];

  if (input.carrier) warnings.push("Carrier no se guardó porque la tabla Packing no tiene un campo editable Carrier.");
  if (input.observacion) warnings.push("Observación no se guardó porque la tabla Packing no tiene un campo editable de nota interna.");

  return {
    packing: mapPacking(await airtableRequest<AirtableRecord>(`${tableUrl(SHIPPING_TABLES.packing)}/${encodeURIComponent(created.id)}`)),
    warning: warnings.length ? warnings.join(" ") : null,
    writtenFields: ["Items", ...patchResult.writtenFields],
  };
}

export async function crearShippingPackingRapido(input: ShippingQuickPackingInput = {}): Promise<ShippingCreatePackingResult> {
  let created: AirtableRecord;

  try {
    created = await airtableRequest<AirtableRecord>(tableUrl(SHIPPING_TABLES.packing), {
      method: "POST",
      body: JSON.stringify({
        fields: {
          Tipo: input.tipo || "Caja",
          Estado: input.estado || "En Proceso",
        },
        typecast: true,
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Estado") && message.includes("INVALID_MULTIPLE_CHOICE_OPTIONS")) {
      throw new Error('No se pudo crear el packing porque falta agregar la opción "En Proceso" al campo Estado de la tabla Packing.');
    }
    throw error;
  }

  const refreshed = await airtableRequest<AirtableRecord>(`${tableUrl(SHIPPING_TABLES.packing)}/${encodeURIComponent(created.id)}`);

  return {
    packing: mapPacking(refreshed),
    warning: null,
    writtenFields: ["Tipo", "Estado"],
  };
}

export function isPackingInProcessStatus(status: string) {
  return normalizeText(status) === "en proceso";
}

export function isPackingClosedStatus(status: string) {
  return normalizeText(status) === "cerrado";
}

export function isPackingInTransitStatus(status: string) {
  return normalizeText(status) === "en transito";
}

export function isPackingReceivedStatus(status: string) {
  return normalizeText(status) === "recibido";
}

export function canEditPackingItems(status: string) {
  return isPackingInProcessStatus(status);
}

export async function agregarItemsAShippingPacking(packingId: string, itemIds: string[]) {
  const packing = await obtenerShippingPackingPorId(packingId);
  if (!canEditPackingItems(packing.estado)) {
    throw new Error("No se pueden modificar ítems porque el packing ya no está en proceso.");
  }

  const availableItems = await obtenerItemsDisponiblesParaPacking(500);
  const availableIds = new Set(availableItems.map((item) => item.id));
  const invalidIds = itemIds.filter((itemId) => !availableIds.has(itemId));
  if (invalidIds.length > 0) {
    throw new Error("Selecciona solo ítems pagados y sin packing.");
  }

  const nextItemIds = Array.from(new Set([...packing.itemIds, ...itemIds]));
  await patchRecordBatch(SHIPPING_TABLES.packing, packingId, { Items: nextItemIds });
  return obtenerShippingPackingDetalle(packingId);
}

export async function quitarItemDeShippingPacking(packingId: string, itemId: string) {
  const packing = await obtenerShippingPackingPorId(packingId);
  if (!canEditPackingItems(packing.estado)) {
    throw new Error("No se pueden modificar ítems porque el packing ya no está en proceso.");
  }

  const nextItemIds = packing.itemIds.filter((currentItemId) => currentItemId !== itemId);
  await patchRecordBatch(SHIPPING_TABLES.packing, packingId, { Items: nextItemIds });
  return obtenerShippingPackingDetalle(packingId);
}

export async function cerrarShippingPacking(packingId: string) {
  const packing = await obtenerShippingPackingPorId(packingId);
  if (!isPackingInProcessStatus(packing.estado)) {
    throw new Error("Solo se puede cerrar un packing en proceso.");
  }
  if (packing.itemIds.length === 0) {
    throw new Error("Agrega al menos un item antes de cerrar el packing.");
  }

  await patchRecordBatch(SHIPPING_TABLES.packing, packingId, { Estado: "Cerrado" });
  return obtenerShippingPackingDetalle(packingId);
}

export async function actualizarLogisticaShippingPacking(packingId: string, input: ShippingPackingLogisticsInput) {
  const packing = await obtenerShippingPackingPorId(packingId);
  if (!isPackingClosedStatus(packing.estado) && !isPackingInTransitStatus(packing.estado)) {
    throw new Error("Los datos logísticos se editan cuando el packing está Cerrado o En Tránsito.");
  }

  const result = await patchEditablePackingFields(packingId, {
    "Peso (Kilos)": input.peso,
    "USA Tracking": input.usaTracking,
    "EC Tracking": input.ecTracking,
    "Fecha Envío": input.fechaEnvio,
    "Arribo Estimado": input.arriboEstimado,
    "Flete EC": input.fleteEc,
    Arancel: input.arancel,
  });

  return {
    detail: await obtenerShippingPackingDetalle(packingId),
    warning: result.warnings.length ? result.warnings.join(" ") : null,
  };
}

export async function marcarShippingPackingEnTransito(packingId: string) {
  const packing = await obtenerShippingPackingPorId(packingId);
  if (!isPackingClosedStatus(packing.estado)) {
    throw new Error("Solo se puede marcar En Tránsito un packing cerrado.");
  }
  if (packing.peso === null || !packing.usaTracking) {
    throw new Error("Registra peso y USA Tracking antes de marcar En Tránsito.");
  }

  await patchRecordBatch(SHIPPING_TABLES.packing, packingId, { Estado: "En Tránsito" });
  return obtenerShippingPackingDetalle(packingId);
}

export async function obtenerShippingProveedores(limit = 100) {
  const records = await listRecords(SHIPPING_TABLES.proveedores, {
    maxRecords: limit,
    sortField: "Nombre",
    sortDirection: "asc",
  });
  return records.map(mapProveedor);
}

export async function obtenerItemsPendientesDePago(limit = 500) {
  const records = await listRecords(SHIPPING_TABLES.item, {
    maxRecords: limit,
    sortField: "Fecha Ofertado",
    sortDirection: "desc",
  });

  return records.map(mapPendingPaymentItem).filter((item): item is ShippingPendingPaymentItem => Boolean(item));
}

export async function obtenerPagosExistentesPorPagoId(pagoIds: string[]) {
  const requestedIds = new Set(pagoIds.filter(Boolean));
  if (requestedIds.size === 0) return new Map<string, ShippingPago>();

  const records = await listRecords(SHIPPING_TABLES.pago, {
    maxRecords: 500,
    sortField: "Fecha de Pago Máx",
    sortDirection: "desc",
  });
  const pagos = records.map(mapPago);
  const existing = new Map<string, ShippingPago>();

  for (const pago of pagos) {
    if (requestedIds.has(pago.pagoId)) {
      existing.set(pago.pagoId, pago);
    }
  }

  return existing;
}

function linkedRecordIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function getPagoItemsField(record: AirtableRecord) {
  if (Array.isArray(record.fields.Items)) return "Items";
  if (Array.isArray(record.fields.Item)) return "Item";
  return "Items";
}

export function obtenerFechaGrupoPago(item: ShippingItem) {
  return dateKeyFromValue(item.fechaOfertado) ?? getServerDateGroupKey();
}

export async function buscarPagoPorPagoId(pagoId: string) {
  const records = await listRecords(SHIPPING_TABLES.pago, {
    maxRecords: 1,
    filterByFormula: `{Pago ID} = '${escapeAirtableFormulaString(pagoId)}'`,
  });

  return records[0] ?? null;
}

async function tryPatchOptionalPagoFields({
  pagoRecordId,
  proveedor,
  proveedorId,
}: {
  pagoRecordId: string;
  proveedor: string;
  proveedorId?: string;
}) {
  const writtenFields: string[] = [];
  const warnings: string[] = [];

  if (proveedorId) {
    try {
      await patchRecordBatch(SHIPPING_TABLES.pago, pagoRecordId, { Proveedor: [proveedorId] });
      writtenFields.push("Proveedor");
    } catch (error) {
      try {
        await patchRecordBatch(SHIPPING_TABLES.pago, pagoRecordId, { Proveedor: proveedor });
        writtenFields.push("Proveedor");
      } catch (fallbackError) {
        warnings.push(`No se pudo escribir Proveedor en Pago: ${fallbackError instanceof Error ? fallbackError.message : "campo no editable"}.`);
      }
    }
  } else if (proveedor) {
    try {
      await patchRecordBatch(SHIPPING_TABLES.pago, pagoRecordId, { Proveedor: proveedor });
      writtenFields.push("Proveedor");
    } catch (error) {
      warnings.push(`No se pudo escribir Proveedor en Pago: ${error instanceof Error ? error.message : "campo no editable"}.`);
    }
  }

  try {
    await patchRecordBatch(SHIPPING_TABLES.pago, pagoRecordId, { "Pago Realizado": false });
    writtenFields.push("Pago Realizado");
  } catch (error) {
    warnings.push(`No se pudo escribir Pago Realizado en Pago: ${error instanceof Error ? error.message : "campo no editable"}.`);
  }

  return { writtenFields, warnings };
}

async function createPagoWithLinkedItem(pagoId: string, itemRecordId: string) {
  const candidates = ["Items", "Item"] as const;
  let lastError: unknown = null;

  for (const fieldName of candidates) {
    try {
      const created = await airtableRequest<AirtableRecord>(tableUrl(SHIPPING_TABLES.pago), {
        method: "POST",
        body: JSON.stringify({
          fields: {
            "Pago ID": pagoId,
            [fieldName]: [itemRecordId],
          },
          typecast: true,
        }),
      });

      return { record: created, itemFieldName: fieldName };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("No se pudo crear el Pago pendiente.");
}

export async function crearPagoPendiente({
  pagoId,
  itemRecordId,
  proveedor,
  proveedorId,
}: {
  pagoId: string;
  itemRecordId: string;
  proveedor: string;
  proveedorId?: string;
}): Promise<ShippingPaymentLinkResult> {
  const created = await createPagoWithLinkedItem(pagoId, itemRecordId);
  const optionalResult = await tryPatchOptionalPagoFields({
    pagoRecordId: created.record.id,
    proveedor,
    proveedorId,
  });

  return {
    pagoId,
    pagoRecordId: created.record.id,
    action: "created",
    writtenFields: ["Pago ID", created.itemFieldName, ...optionalResult.writtenFields],
    warnings: optionalResult.warnings,
  };
}

export async function agregarItemAPago(
  pagoRecord: AirtableRecord,
  itemRecordId: string,
  options: { proveedor?: string; proveedorId?: string } = {}
): Promise<ShippingPaymentLinkResult> {
  const itemFieldName = getPagoItemsField(pagoRecord);
  const currentItemIds = linkedRecordIds(pagoRecord.fields[itemFieldName]);
  const nextItemIds = Array.from(new Set([...currentItemIds, itemRecordId]));
  let writtenItemField = itemFieldName;
  const warnings: string[] = [];

  try {
    await patchRecord(SHIPPING_TABLES.pago, pagoRecord.id, { [itemFieldName]: nextItemIds });
  } catch (error) {
    const fallbackFieldName = itemFieldName === "Items" ? "Item" : "Items";
    await patchRecord(SHIPPING_TABLES.pago, pagoRecord.id, { [fallbackFieldName]: nextItemIds });
    writtenItemField = fallbackFieldName;
    warnings.push(`No se pudo usar el campo ${itemFieldName}; se vinculó usando ${fallbackFieldName}.`);
  }

  const optionalResult = options.proveedor
    ? await tryPatchOptionalPagoFields({
        pagoRecordId: pagoRecord.id,
        proveedor: options.proveedor,
        proveedorId: options.proveedorId,
      })
    : { writtenFields: [], warnings: [] };

  if (optionalResult.warnings.length) {
    warnings.push(...optionalResult.warnings);
  }

  return {
    pagoId: firstString(pagoRecord.fields["Pago ID"], pagoRecord.id),
    pagoRecordId: pagoRecord.id,
    action: "updated",
    writtenFields: [writtenItemField, ...optionalResult.writtenFields],
    warnings,
  };
}

export async function crearOActualizarPagoPendienteParaItem(item: ShippingItem, options: { proveedorId?: string } = {}): Promise<ShippingPaymentLinkResult> {
  if (!item.proveedor) {
    return {
      pagoId: null,
      pagoRecordId: null,
      action: "skipped",
      writtenFields: [],
      warnings: ["El item se creó, pero no tiene proveedor para agrupar el pago."],
    };
  }

  if (item.costoProveedor === null) {
    return {
      pagoId: null,
      pagoRecordId: null,
      action: "skipped",
      writtenFields: [],
      warnings: ["El item se creó, pero no tiene Costo Proveedor para agrupar el pago."],
    };
  }

  if (item.costoProveedor < 0) {
    throw new Error("Costo Proveedor no puede ser negativo para crear grupo de pago.");
  }

  const fechaGrupo = obtenerFechaGrupoPago(item);
  const pagoId = generarPagoIdShipping(fechaGrupo, item.proveedor);
  const existingPago = await buscarPagoPorPagoId(pagoId);

  if (existingPago) {
    return agregarItemAPago(existingPago, item.id, { proveedor: item.proveedor, proveedorId: options.proveedorId });
  }

  return crearPagoPendiente({
    pagoId,
    itemRecordId: item.id,
    proveedor: item.proveedor,
    proveedorId: options.proveedorId,
  });
}

export function isPendingShippingPago(pago: ShippingPago) {
  return !pago.pagoRealizado && !isPaidStatus(pago.estadoPago);
}

export function isShippingPagoPaid(pago: ShippingPago) {
  return pago.pagoRealizado || isPaidStatus(pago.estadoPago);
}

async function writePagoRealizadoValue(pagoRecordId: string, paidAtIso: string) {
  try {
    await patchRecordBatch(SHIPPING_TABLES.pago, pagoRecordId, { "Pago Realizado": true });
    return "checkbox" as const;
  } catch (checkboxError) {
    await patchRecordBatch(SHIPPING_TABLES.pago, pagoRecordId, { "Pago Realizado": paidAtIso });
    return "datetime" as const;
  }
}

async function patchEditablePagoFields(pagoRecordId: string, fields: Record<string, unknown>) {
  const writtenFields: string[] = [];
  const warnings: string[] = [];

  for (const [fieldName, value] of Object.entries(fields)) {
    try {
      await patchRecordBatch(SHIPPING_TABLES.pago, pagoRecordId, { [fieldName]: value });
      writtenFields.push(fieldName);
    } catch (error) {
      warnings.push(`No se pudo escribir ${fieldName}: ${error instanceof Error ? error.message : "campo no editable"}.`);
    }
  }

  return { writtenFields, warnings };
}

export async function registrarPagoShipping(input: ShippingPaymentRegistrationInput): Promise<ShippingPaymentRegistrationResult> {
  const paidAtIso = new Date().toISOString();
  const fields: Record<string, unknown> = {
    "Fecha de Pago Real": input.fechaPagoReal,
    "Método de Pago": input.metodoPago,
    "Cuenta Origen": input.cuentaOrigen,
    "Transacción ID": input.transaccionId,
    Observación: input.observacion,
    "Registrado por": input.registradoPor,
    "Estado Integración Finanzas": "Pendiente",
    "Movimiento Finanzas ID": "",
  };

  const editableResult = await patchEditablePagoFields(input.pagoRecordId, fields);
  const pagoRealizadoWrittenAs = await writePagoRealizadoValue(input.pagoRecordId, paidAtIso);

  const warnings = [...editableResult.warnings];
  if (input.comprobante) {
    try {
      await uploadAttachmentToRecord({
        recordId: input.pagoRecordId,
        attachmentFieldName: "Comprobante",
        filename: input.comprobante.filename,
        contentType: input.comprobante.contentType,
        fileBase64: input.comprobante.fileBase64,
      });
    } catch (error) {
      console.error("Pago registrado, pero comprobante no subido:", error);
      warnings.push("Pago registrado, pero comprobante no subido.");
    }
  }

  return {
    pago: await obtenerShippingPagoPorId(input.pagoRecordId),
    warning: warnings.length ? warnings.join(" ") : null,
    writtenFields: [
      ...editableResult.writtenFields,
      "Pago Realizado",
      ...(input.comprobante && !warnings.some((warning) => warning === "Pago registrado, pero comprobante no subido.") ? ["Comprobante"] : []),
    ],
    pagoRealizadoWrittenAs,
  };
}

function isNewShippingPaymentFlowItem(item: ShippingPendingPaymentItem) {
  const dateKey = dateKeyFromValue(item.fechaOfertado);
  if (!dateKey) return false;
  return dateKey >= SHIPPING_PAYMENTS_START_DATE.replaceAll("-", "");
}

function construirGruposSugeridos(items: ShippingPendingPaymentItem[]): ShippingPaymentPreviewGroup[] {
  const groups = new Map<string, ShippingPendingPaymentItem[]>();

  for (const item of items) {
    const providerKey = normalizeProveedorForPagoId(item.proveedor);
    const key = `${item.fechaGrupo}:${providerKey}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return Array.from(groups.entries())
    .map(([key, groupItems]) => {
      const firstItem = groupItems[0];
      const proveedorNormalizado = normalizeProveedorForPagoId(firstItem.proveedor);
      const pagoId = generarPagoIdShipping(firstItem.fechaGrupo, firstItem.proveedor);
      const regalos = groupItems.filter((item) => item.regalo);
      const itemsConCosto = groupItems.filter((item) => !item.regalo && item.costoProveedor !== null);

      return {
        key,
        pagoId,
        proveedor: firstItem.proveedor,
        proveedorNormalizado,
        fechaGrupo: firstItem.fechaGrupo,
        fechaGrupoLabel: formatGroupDateLabel(firstItem.fechaGrupo),
        itemConCostoCount: itemsConCosto.length,
        regaloCount: regalos.length,
        totalCostoProveedor: itemsConCosto.reduce((sum, item) => sum + (item.costoProveedor ?? 0), 0),
        status: "suggested" as const,
        items: groupItems,
        itemsConCosto,
        regalos,
      };
    })
    .sort((a, b) => a.fechaGrupo.localeCompare(b.fechaGrupo) || a.proveedor.localeCompare(b.proveedor, "es"));
}

export async function construirPreparacionPagosShipping(): Promise<ShippingPaymentPreparationPreview> {
  const [items, pagos] = await Promise.all([obtenerItemsPendientesDePago(), obtenerShippingPagosRecientes(500)]);
  const itemsNuevos = items.filter(isNewShippingPaymentFlowItem);
  const itemsAntiguosPorRevisar = items.filter((item) => !isNewShippingPaymentFlowItem(item));

  return {
    gruposNuevosSugeridos: construirGruposSugeridos(itemsNuevos),
    pagosExistentesPendientes: pagos.filter(isPendingShippingPago),
    itemsAntiguosPorRevisar,
  };
}

export async function construirVistaPreviaPagosPendientes(): Promise<ShippingPaymentPreviewGroup[]> {
  const items = await obtenerItemsPendientesDePago();
  return construirGruposSugeridos(items.filter(isNewShippingPaymentFlowItem));
}

export async function crearShippingItem(input: ShippingNewItemInput, fotos: ShippingAttachmentInput[] = []) {
  const fields: Record<string, unknown> = {
    Item: input.item,
    Categoria: input.categoria,
    "Item Para": input.itemPara,
    Proveedor: [input.proveedorId],
    "Costo Proveedor": input.costoProveedor,
    Qty: input.qty ?? 1,
    Regalo: input.regalo,
    Encargo: input.encargo,
  };

  if (input.precioVenta !== null) fields["Precio Venta"] = input.precioVenta;
  if (input.peso !== null) fields["Peso (Kilos)"] = input.peso;
  if (input.carrier) fields.Carrier = input.carrier;
  if (input.usaTracking) fields["USA Tracking"] = input.usaTracking;
  if (input.ecTracking) fields["EC Tracking"] = input.ecTracking;
  if (input.notaInterna) fields["Nota Interna"] = input.notaInterna;
  if (input.notaPublica) fields["Nota Pública"] = input.notaPublica;

  const created = await airtableRequest<AirtableRecord>(tableUrl(SHIPPING_TABLES.item), {
    method: "POST",
    body: JSON.stringify({ fields }),
  });

  const failedFiles: string[] = [];

  for (const foto of fotos) {
    try {
      await uploadAttachmentToRecord({
        recordId: created.id,
        attachmentFieldName: "Fotos",
        filename: foto.filename,
        contentType: foto.contentType,
        fileBase64: foto.fileBase64,
      });
    } catch (error) {
      console.error("No se pudo agregar foto al item de Shipping:", error);
      failedFiles.push(foto.filename);
    }
  }

  return {
    item: mapItem(created),
    warning: failedFiles.length > 0 ? `El item fue creado, pero no se pudieron subir: ${failedFiles.join(", ")}.` : null,
  };
}

export async function obtenerShippingDashboard(): Promise<{
  summary: ShippingDashboardSummary;
  pendingWork: ShippingDashboardPendingWork;
  items: ShippingItem[];
  pagos: ShippingPago[];
  packings: ShippingPacking[];
  proveedores: ShippingProveedor[];
}> {
  const [items, pagos, packings, proveedores] = await Promise.all([
    obtenerShippingItemsRecientes(100),
    obtenerShippingPagosRecientes(100),
    obtenerShippingPackingsRecientes(100),
    obtenerShippingProveedores(100),
  ]);

  const itemsPendientesPago = items.filter(itemNeedsPayment);
  const itemsPagadosSinPacking = items.filter(itemPaidWithoutPacking);
  const pagosPendientes = pagos.filter((pago) => !pago.pagoRealizado && !isPaidStatus(pago.estadoPago));
  const pagosRealizados = pagos.filter((pago) => pago.pagoRealizado || isPaidStatus(pago.estadoPago));
  const packingsPreparacion = packings.filter((packing) => isPackingInPreparation(packing.estado));
  const packingsEnviados = packings.filter((packing) => isPackingSent(packing.estado));
  const packingsRecibidos = packings.filter((packing) => isPackingReceived(packing.estado));

  return {
    summary: {
      itemsRecientes: items.length,
      itemsPendientesPago: itemsPendientesPago.length,
      pagosPendientes: pagosPendientes.length,
      pagosRealizados: pagosRealizados.length,
      itemsPagadosSinPacking: itemsPagadosSinPacking.length,
      packingsPreparacion: packingsPreparacion.length,
      packingsEnviados: packingsEnviados.length,
      packingsRecibidos: packingsRecibidos.length,
      itemsRegalo: items.filter((item) => item.regalo).length,
      itemsEncargo: items.filter((item) => item.encargo).length,
    },
    pendingWork: {
      itemsPendientesPago: itemsPendientesPago.slice(0, 5),
      itemsPagadosSinPacking: itemsPagadosSinPacking.slice(0, 5),
      packingsSinTrackingUsa: packings.filter((packing) => !packing.usaTracking).slice(0, 5),
      packingsEnviadosSinRecepcion: packingsEnviados.filter((packing) => !isPackingReceived(packing.estado)).slice(0, 5),
      encargosPendientesAgrupar: items.filter((item) => item.encargo && item.packingCount === 0).slice(0, 5),
    },
    items: items.slice(0, 8),
    pagos: pagos.slice(0, 8),
    packings: packings.slice(0, 8),
    proveedores: proveedores.slice(0, 8),
  };
}

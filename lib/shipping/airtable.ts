import "server-only";

import type {
  ShippingAttachmentInput,
  ShippingDashboardPendingWork,
  ShippingDashboardSummary,
  ShippingItem,
  ShippingNewItemInput,
  ShippingPacking,
  ShippingPago,
  ShippingProveedor,
} from "@/types/shipping";

type AirtableRecord = {
  id: string;
  fields: Record<string, unknown>;
};

type AirtableListResponse = {
  records?: AirtableRecord[];
  offset?: string;
};

const SHIPPING_TABLES = {
  item: process.env.AIRTABLE_ITEM_TABLE?.trim() || "Item",
  pago: process.env.AIRTABLE_PAGO_TABLE?.trim() || "Pago",
  packing: process.env.AIRTABLE_PACKING_TABLE?.trim() || "Packing",
  proveedores: process.env.AIRTABLE_PROVEEDORES_TABLE?.trim() || "Proveedores",
} as const;

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

function boolValue(value: unknown) {
  return value === true;
}

function linkedCount(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function hasLinkedValue(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  return firstString(value).trim().length > 0;
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
  return normalized.includes("pagado") || normalized.includes("pago realizado") || normalized === "paid";
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

async function listRecords(tableName: string, options: { pageSize?: number; maxRecords?: number; sortField?: string; sortDirection?: "asc" | "desc"; filterByFormula?: string } = {}) {
  const records: AirtableRecord[] = [];
  let offset: string | null = null;

  do {
    const url = new URL(tableUrl(tableName));
    url.searchParams.set("pageSize", String(options.pageSize ?? 100));
    if (options.maxRecords) url.searchParams.set("maxRecords", String(options.maxRecords));
    if (options.filterByFormula) url.searchParams.set("filterByFormula", options.filterByFormula);
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
  };
}

function mapPago(record: AirtableRecord): ShippingPago {
  const f = record.fields;
  return {
    id: record.id,
    pagoId: firstString(f["Pago ID"], record.id),
    totalPago: firstNumber(f["Total Pago"]),
    fechaPagoMax: firstString(f["Fecha de Pago Máx"]),
    transaccionId: firstString(f["Transacción ID"]),
    proveedor: firstString(f["Proveedor (from Items)"]),
    pagoRealizado: boolValue(f["Pago Realizado"]),
    estadoPago: firstString(f["Estado de Pago"]),
    recargosPagoExterior: firstNumber(f["Recargos Pago Exterior"]),
  };
}

function mapPacking(record: AirtableRecord): ShippingPacking {
  const f = record.fields;
  return {
    id: record.id,
    pack: firstString(f["Pack"], record.id),
    tipo: firstString(f["Tipo"]),
    estado: firstString(f["Estado"]),
    items: firstString(f["Items"]),
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
  });
  return records.map(mapPago);
}

export async function obtenerShippingPackingsRecientes(limit = 50) {
  const records = await listRecords(SHIPPING_TABLES.packing, {
    maxRecords: limit,
    sortField: "Fecha Envío",
    sortDirection: "desc",
  });
  return records.map(mapPacking);
}

export async function obtenerShippingProveedores(limit = 100) {
  const records = await listRecords(SHIPPING_TABLES.proveedores, {
    maxRecords: limit,
    sortField: "Nombre",
    sortDirection: "asc",
  });
  return records.map(mapProveedor);
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

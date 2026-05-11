import {
  normalizeCarrierPedido,
  type PedidoItem,
  type PedidoUpdateInput,
  type ProveedorOrigenPedido,
} from "@/types/pedidos";

type AirtableRecord = {
  id: string;
  fields: Record<string, unknown>;
};

type AirtableListResponse = {
  records?: AirtableRecord[];
  offset?: string;
};

const ITEM_TABLE = process.env.AIRTABLE_ITEM_TABLE?.trim() || "Item";
const OPCIONES_TABLE = process.env.AIRTABLE_OPCIONES_COTIZACION_TABLE?.trim() || "Opciones de Cotización";
const PROVEEDORES_TABLE = process.env.AIRTABLE_PROVEEDORES_TABLE?.trim() || "Proveedores";

function getRequiredEnv(name: string) {
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
    baseUrl: `https://api.airtable.com/v0/${baseId}`,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };
}

function itemUrl(recordId?: string) {
  const client = getClient();
  return {
    client,
    url: `${client.baseUrl}/${encodeURIComponent(ITEM_TABLE)}${recordId ? `/${encodeURIComponent(recordId)}` : ""}`,
  };
}

function airtableUrl(tableName: string, recordId?: string) {
  const client = getClient();
  return {
    client,
    url: `${client.baseUrl}/${encodeURIComponent(tableName)}${recordId ? `/${encodeURIComponent(recordId)}` : ""}`,
  };
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

function linkedIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim() !== "");
}

function normalizeProveedorOrigen(value: unknown): ProveedorOrigenPedido {
  const normalized = firstString(value).trim().toUpperCase();
  if (normalized === "ECU" || normalized === "USA" || normalized === "CHN") return normalized;
  return "";
}

function buildPedidoLogistica(input: {
  proveedor: string;
  proveedorOrigen: ProveedorOrigenPedido;
  encargo: boolean;
}) {
  const esProveedorLocal = input.proveedorOrigen === "ECU";
  const esProveedorExterior = input.proveedorOrigen === "USA" || input.proveedorOrigen === "CHN";
  return {
    proveedor: input.proveedor,
    proveedorOrigen: input.proveedorOrigen,
    esProveedorLocal,
    esProveedorExterior,
    requiereUsaTracking: esProveedorExterior,
    requiereEcTracking: true,
    estaEncargado: input.encargo,
  };
}

function getPedidoProviderFallback(fields: Record<string, unknown>) {
  const proveedor =
    firstString(fields["Proveedor"]) ||
    firstString(fields["Nombre Proveedor"]) ||
    firstString(fields["Proveedor Nombre"]);
  const proveedorOrigen =
    normalizeProveedorOrigen(fields["Dirección"]) ||
    normalizeProveedorOrigen(fields["Proveedor Dirección"]) ||
    normalizeProveedorOrigen(fields["Origen del Proveedor"]) ||
    normalizeProveedorOrigen(fields["Proveedor Origen"]);
  return { proveedor, proveedorOrigen };
}

function mapPedido(record: AirtableRecord, providerOverride?: { proveedor?: string; proveedorOrigen?: ProveedorOrigenPedido }): PedidoItem {
  const f = record.fields;
  const providerFallback = getPedidoProviderFallback(f);
  const proveedor = providerOverride?.proveedor || providerFallback.proveedor;
  const proveedorOrigen = providerOverride?.proveedorOrigen || providerFallback.proveedorOrigen;
  const encargo = boolValue(f["Encargo"]);
  return {
    id: record.id,
    codigo: firstString(f["Código"], record.id),
    item: firstString(f["Item"], "Sin item"),
    categoria: firstString(f["Categoria"]),
    itemPara: firstString(f["Item Para"]),
    precioVenta: firstNumber(f["Precio Venta"]),
    costoProveedor: firstNumber(f["Costo Proveedor"]),
    fleteEcItemSolo: firstNumber(f["Flete EC (Item Solo)"]),
    arancelItemSolo: firstNumber(f["Arancel (Item Solo)"]),
    ganancia: firstNumber(f["Ganancia"]),
    gananciaNeta: firstNumber(f["Ganancia Neta"]),
    ...buildPedidoLogistica({ proveedor, proveedorOrigen, encargo }),
    usaTracking: firstString(f["USA Tracking"]),
    ecTracking: firstString(f["EC Tracking"]),
    carrier: firstString(f["Carrier"]),
    recibido: boolValue(f["Recibido"]),
    recibidoEnLv: boolValue(f["Recibido en LV"]),
    estadosPedido: firstString(f["Estados Pedido"]),
    notaInterna: firstString(f["Nota Interna"]),
    notaPublica: firstString(f["Nota Pública"]),
    cotizacionId: firstString(f["Cotización ID"]),
    cotizacionCodigo: firstString(f["Cotización Código"]),
    opcionCotizacionId: firstString(f["Opción Cotización ID"]),
    clienteRecordIdReparaciones: firstString(f["Cliente Record ID Reparaciones"]),
    clienteNombreSnapshot: firstString(f["Cliente Nombre Snapshot"], "Sin cliente"),
    clienteTelefonoSnapshot: firstString(f["Cliente Teléfono Snapshot"]),
    requiereInstalacion: boolValue(f["Requiere Instalación"]),
    ordenReparacionId: firstString(f["Orden Reparación ID"]),
    ordenReparacionCodigo: firstString(f["Orden Reparación Código"]),
    estadoInstalacion: firstString(f["Estado Instalación"]),
  };
}

async function fetchProviderForOption(optionId: string): Promise<{ proveedor: string; proveedorOrigen: ProveedorOrigenPedido } | null> {
  if (!optionId) return null;

  const { client: optionClient, url: optionUrl } = airtableUrl(OPCIONES_TABLE, optionId);
  const optionResponse = await fetch(optionUrl, { headers: optionClient.headers, cache: "no-store" });
  if (optionResponse.status === 404) return null;
  if (!optionResponse.ok) {
    const text = await optionResponse.text();
    throw new Error(`Airtable error ${optionResponse.status}: ${text}`);
  }

  const option = (await optionResponse.json()) as AirtableRecord;
  const providerIds = linkedIds(option.fields["Proveedor"]);
  const fallbackName = firstString(option.fields["Proveedor"]);
  if (providerIds.length === 0) {
    return fallbackName ? { proveedor: fallbackName, proveedorOrigen: "" } : null;
  }

  const { client: providerClient, url: providerUrl } = airtableUrl(PROVEEDORES_TABLE, providerIds[0]);
  const providerResponse = await fetch(providerUrl, { headers: providerClient.headers, cache: "no-store" });
  if (providerResponse.status === 404) {
    return fallbackName ? { proveedor: fallbackName, proveedorOrigen: "" } : null;
  }
  if (!providerResponse.ok) {
    const text = await providerResponse.text();
    throw new Error(`Airtable error ${providerResponse.status}: ${text}`);
  }

  const provider = (await providerResponse.json()) as AirtableRecord;
  return {
    proveedor: firstString(provider.fields["Nombre"], fallbackName || provider.id),
    proveedorOrigen: normalizeProveedorOrigen(provider.fields["Dirección"]),
  };
}

async function enrichPedido(record: AirtableRecord): Promise<PedidoItem> {
  const optionId = firstString(record.fields["Opción Cotización ID"]);
  try {
    const provider = await fetchProviderForOption(optionId);
    return mapPedido(record, provider ?? undefined);
  } catch (error) {
    console.warn("No se pudo enriquecer proveedor del pedido:", error);
    return mapPedido(record);
  }
}

async function airtableRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const { client } = itemUrl();
  const response = await fetch(url, {
    ...init,
    headers: { ...client.headers, ...(init?.headers || {}) },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable error ${response.status}: ${text}`);
  }

  return (await response.json()) as T;
}

export async function fetchPedidos(): Promise<PedidoItem[]> {
  const { client, url } = itemUrl();
  const records: AirtableRecord[] = [];
  let offset: string | null = null;

  do {
    const pageUrl = new URL(url);
    pageUrl.searchParams.set("pageSize", "100");
    pageUrl.searchParams.set(
      "filterByFormula",
      "AND({Item Para} = 'Pedido', OR(({Cotización ID} & '') != '', ({Cliente Nombre Snapshot} & '') != ''))"
    );
    pageUrl.searchParams.append("sort[0][field]", "Código");
    pageUrl.searchParams.append("sort[0][direction]", "desc");
    if (offset) pageUrl.searchParams.set("offset", offset);

    const data = await airtableRequest<AirtableListResponse>(pageUrl.toString(), { headers: client.headers });
    records.push(...(data.records ?? []));
    offset = data.offset ?? null;
  } while (offset);

  return Promise.all(records.map(enrichPedido));
}

export async function fetchPedidoById(id: string): Promise<PedidoItem | null> {
  const { client, url } = itemUrl(id);
  const response = await fetch(url, { headers: client.headers, cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable error ${response.status}: ${text}`);
  }
  return enrichPedido((await response.json()) as AirtableRecord);
}

export async function updatePedido(id: string, input: PedidoUpdateInput) {
  const fields: Record<string, unknown> = {};
  if (input.usaTracking !== undefined) fields["USA Tracking"] = input.usaTracking;
  if (input.ecTracking !== undefined) fields["EC Tracking"] = input.ecTracking;
  if (input.recibido !== undefined) fields["Recibido"] = input.recibido;
  if (input.recibidoEnLv !== undefined) fields["Recibido en LV"] = input.recibidoEnLv;
  if (input.notaInterna !== undefined) fields["Nota Interna"] = input.notaInterna;
  if (input.notaPublica !== undefined) fields["Nota Pública"] = input.notaPublica;
  if (input.carrier !== undefined) {
    const carrier = normalizeCarrierPedido(input.carrier);
    fields["Carrier"] = carrier || undefined;
  }

  const { client, url } = itemUrl(id);
  const data = await airtableRequest<AirtableRecord>(url, {
    method: "PATCH",
    headers: client.headers,
    body: JSON.stringify({ fields }),
  });
  return enrichPedido(data);
}

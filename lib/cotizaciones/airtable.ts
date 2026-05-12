import {
  ESTADOS_COTIZACION,
  type CotizacionDetalle,
  type CotizacionListado,
  type CotizacionResumenEstado,
  type CrearAbonoCotizacionInput,
  type CrearCotizacionInput,
  type CrearOpcionCotizacionInput,
  type ActualizarOpcionCotizacionInput,
  type EstadoCotizacion,
  type AirtableAttachment,
  type AbonoCotizacion,
  type OpcionCotizacion,
  type ProveedorCotizacion,
} from "@/types/cotizaciones";
import { normalizeSku, validateSkuForItem } from "@/lib/sku/sku-service";

type AirtableRecord = {
  id: string;
  createdTime?: string;
  fields: Record<string, unknown>;
};

type AirtableListResponse = {
  records?: AirtableRecord[];
  offset?: string;
};

type AirtableClient = {
  baseId: string;
  baseUrl: string;
  headers: HeadersInit;
};

type AirtableUploadAttachmentInput = {
  recordId: string;
  attachmentFieldIdOrName: string;
  filename: string;
  contentType: string;
  fileBase64: string;
};

export const COTIZACIONES_TABLES = {
  cotizaciones: process.env.AIRTABLE_COTIZACIONES_TABLE?.trim() || "Cotizaciones",
  opciones:
    process.env.AIRTABLE_OPCIONES_COTIZACION_TABLE?.trim() || "Opciones de Cotización",
  abonos: process.env.AIRTABLE_ABONOS_COTIZACION_TABLE?.trim() || "Abonos de Cotización",
  item: process.env.AIRTABLE_ITEM_TABLE?.trim() || "Item",
  proveedores: process.env.AIRTABLE_PROVEEDORES_TABLE?.trim() || "Proveedores",
} as const;

const OPCIONES_COTIZACION_FIELDS = {
  opcion: "Opción",
  cotizacion: "Cotización",
  proveedor: "Proveedor",
  productoDescripcion: "Producto / Descripción",
  costoProveedor: "Costo Proveedor",
  precioVentaCliente: "Precio Venta Cliente",
  gananciaEstimada: "Ganancia Estimada",
  fotos: "Fotos",
  urlProveedor: "URL Proveedor",
  tiempoEstimado: "Tiempo Estimado",
  estadoOpcion: "Estado Opción",
  estadoDeOpcion: "Estado de Opción",
  opcionElegida: "Opción Elegida",
  itemPedidoGenerado: "Item/Pedido Generado",
  observacionesInternas: "Observaciones Internas",
  notaParaCliente: "Nota para Cliente",
} as const;

const OPCIONES_COTIZACION_REQUIRED_CREATE_FIELDS = [
  OPCIONES_COTIZACION_FIELDS.cotizacion,
  OPCIONES_COTIZACION_FIELDS.proveedor,
  OPCIONES_COTIZACION_FIELDS.productoDescripcion,
  OPCIONES_COTIZACION_FIELDS.costoProveedor,
  OPCIONES_COTIZACION_FIELDS.precioVentaCliente,
] as const;

const ESTADOS_OPCION_AIRTABLE = {
  disponible: "Disponible",
  ofrecidaAlCliente: "Ofrecida al Cliente",
  seleccionada: "Seleccionada",
  descartada: "Descartada",
  noDisponible: "No Disponible",
} as const;

function getRequiredEnv(name: string, fallbackName?: string) {
  const value = process.env[name]?.trim() || (fallbackName ? process.env[fallbackName]?.trim() : "");
  if (!value) {
    throw new Error(
      `Falta ${name}${fallbackName ? ` o ${fallbackName}` : ""}. Definir en .env.local.`
    );
  }
  return value;
}

function getClient(): AirtableClient {
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

const airtableFieldsCache = new Map<string, Promise<Set<string> | null>>();

async function getAirtableTableFields(tableName: string): Promise<Set<string> | null> {
  const client = getClient();
  const cacheKey = `${client.baseId}:${tableName}`;
  const cached = airtableFieldsCache.get(cacheKey);
  if (cached) return cached;

  const request = (async () => {
    try {
      const response = await fetch(`https://api.airtable.com/v0/meta/bases/${client.baseId}/tables`, {
        headers: client.headers,
        cache: "no-store",
      });
      if (!response.ok) return null;
      const data = (await response.json()) as {
        tables?: Array<{ name?: string; fields?: Array<{ name?: string }> }>;
      };
      const table = data.tables?.find((item) => item.name === tableName);
      if (!table?.fields) return null;
      return new Set(
        table.fields
          .map((field) => field.name)
          .filter((fieldName): fieldName is string => typeof fieldName === "string")
      );
    } catch {
      return null;
    }
  })();

  airtableFieldsCache.set(cacheKey, request);
  return request;
}

async function airtableTableHasField(tableName: string, fieldName: string) {
  const fields = await getAirtableTableFields(tableName);
  if (fields) return fields.has(fieldName);

  try {
    const client = getClient();
    const response = await fetch(`https://api.airtable.com/v0/meta/bases/${client.baseId}/tables`, {
      headers: client.headers,
      cache: "no-store",
    });
    if (!response.ok) return false;
    const data = (await response.json()) as {
      tables?: Array<{ name?: string; fields?: Array<{ name?: string }> }>;
    };
    const table = data.tables?.find((item) => item.name === tableName);
    return Boolean(table?.fields?.some((field) => field.name === fieldName));
  } catch {
    return false;
  }
}

async function getOpcionesCotizacionFields() {
  return getAirtableTableFields(COTIZACIONES_TABLES.opciones);
}

function resolveOpcionEstadoFieldName(fields?: Set<string> | null) {
  if (fields?.has(OPCIONES_COTIZACION_FIELDS.estadoOpcion)) {
    return OPCIONES_COTIZACION_FIELDS.estadoOpcion;
  }
  if (fields?.has(OPCIONES_COTIZACION_FIELDS.estadoDeOpcion)) {
    return OPCIONES_COTIZACION_FIELDS.estadoDeOpcion;
  }
  return OPCIONES_COTIZACION_FIELDS.estadoOpcion;
}

function fieldExists(fields: Set<string> | null | undefined, fieldName: string) {
  return Boolean(fields?.has(fieldName));
}

function addOptionalAirtableField(
  target: Record<string, unknown>,
  availableFields: Set<string> | null | undefined,
  fieldName: string,
  value: unknown
) {
  if (value === null || value === undefined || value === "") return;
  if (fieldExists(availableFields, fieldName)) target[fieldName] = value;
}

async function uploadAttachmentToRecord({
  recordId,
  attachmentFieldIdOrName,
  filename,
  contentType,
  fileBase64,
}: AirtableUploadAttachmentInput) {
  const client = getClient();
  const url = `https://content.airtable.com/v0/${encodeURIComponent(client.baseId)}/${encodeURIComponent(recordId)}/${encodeURIComponent(attachmentFieldIdOrName)}/uploadAttachment`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...client.headers,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      contentType,
      filename,
      file: fileBase64,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable uploadAttachment error ${response.status}: ${text}`);
  }
}

function airtableUrl(tableName: string, recordId?: string) {
  const client = getClient();
  const recordPath = recordId ? `/${encodeURIComponent(recordId)}` : "";
  return {
    client,
    url: `${client.baseUrl}/${encodeURIComponent(tableName)}${recordPath}`,
  };
}

function firstString(value: unknown, fallback = ""): string {
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

function normalizeEstadoOpcionCotizacion(value: unknown) {
  const raw = firstString(value).trim();
  if (!raw) return ESTADOS_OPCION_AIRTABLE.disponible;

  if (raw === "Borrador") return ESTADOS_OPCION_AIRTABLE.disponible;
  if (raw === "Ofrecida") return ESTADOS_OPCION_AIRTABLE.ofrecidaAlCliente;
  if (raw === "Elegida" || raw === "Convertida en pedido") {
    return ESTADOS_OPCION_AIRTABLE.seleccionada;
  }
  if (raw === "Rechazada") return ESTADOS_OPCION_AIRTABLE.descartada;
  if (raw === "Expirada") return ESTADOS_OPCION_AIRTABLE.noDisponible;

  if (Object.values(ESTADOS_OPCION_AIRTABLE).some((estado) => estado === raw)) return raw;
  return ESTADOS_OPCION_AIRTABLE.disponible;
}

function normalizeProveedorDireccion(value: unknown): ProveedorCotizacion["direccion"] {
  const normalized = firstString(value).trim().toUpperCase();
  if (normalized === "ECU" || normalized === "USA" || normalized === "CHN") return normalized;
  return "";
}

function attachmentList(value: unknown): AirtableAttachment[] {
  if (!Array.isArray(value)) return [];
  const attachments: AirtableAttachment[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
      const row = item as {
        id?: unknown;
        url?: unknown;
        filename?: unknown;
        size?: unknown;
        type?: unknown;
        thumbnails?: unknown;
      };
      const url = typeof row.url === "string" ? row.url : "";
      if (!url) continue;
      attachments.push({
        id: typeof row.id === "string" ? row.id : null,
        url,
        filename: typeof row.filename === "string" ? row.filename : null,
        size: typeof row.size === "number" ? row.size : null,
        type: typeof row.type === "string" ? row.type : null,
        thumbnails: row.thumbnails,
      });
  }
  return attachments;
}

function linkedIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim() !== "");
}

function escapeFormulaString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function buildSearchFormula(query: string) {
  const clean = query.trim();
  if (!clean) return "";
  const escaped = escapeFormulaString(clean.toLowerCase());
  return `OR(FIND('${escaped}', LOWER({Código Cotización} & '')), FIND('${escaped}', LOWER({Cliente Nombre} & '')), FIND('${escaped}', LOWER({Producto Solicitado} & '')), FIND('${escaped}', LOWER({Categoría} & '')))`;
}

function mapCategoriaCotizacionToItem(categoria: string) {
  const normalized = categoria.trim().toLowerCase();
  if (normalized === "laptop") return "Laptop";
  if (normalized === "desktop" || normalized === "imac") return "Desktop";
  if (normalized === "repuesto" || normalized === "mainboard" || normalized === "batería" || normalized === "bateria") {
    return "Repuesto";
  }
  if (normalized === "accesorio") return "Accesorio";
  return "Electronico";
}

function mapCotizacion(record: AirtableRecord): CotizacionListado {
  const fields = record.fields;
  return {
    id: record.id,
    codigo: firstString(fields["Código Cotización"], record.id),
    clienteNombre: firstString(fields["Cliente Nombre"], "Sin cliente"),
    productoSolicitado: firstString(fields["Producto Solicitado"], "Sin producto"),
    categoria: firstString(fields["Categoría"], "-"),
    estado: firstString(fields["Estado Cotización"], "Pendiente"),
    totalCotizado: firstNumber(fields["Total Cotizado"]),
    totalAbonado: firstNumber(fields["Total Abonado"]),
    saldoPendiente: firstNumber(fields["Saldo Pendiente"]),
    fechaCreacion: firstString(fields["Fecha Creación"], record.createdTime ?? ""),
    itemPedidoId: firstString(fields["Pedido Generado"]) || firstString(fields["Item Pedido ID"]),
  };
}

function mapOpcion(record: AirtableRecord): OpcionCotizacion {
  const fields = record.fields;
  const estado = normalizeEstadoOpcionCotizacion(
    fields[OPCIONES_COTIZACION_FIELDS.estadoOpcion] ||
      fields[OPCIONES_COTIZACION_FIELDS.estadoDeOpcion]
  );
  const itemPedidoGeneradoIds = linkedIds(fields[OPCIONES_COTIZACION_FIELDS.itemPedidoGenerado]);
  const seleccionadaPorCliente =
    boolValue(fields[OPCIONES_COTIZACION_FIELDS.opcionElegida]) ||
    estado === ESTADOS_OPCION_AIRTABLE.seleccionada ||
    itemPedidoGeneradoIds.length > 0;
  const productoDescripcion =
    firstString(fields[OPCIONES_COTIZACION_FIELDS.productoDescripcion], "Opción sin descripción");
  return {
    id: record.id,
    opcion: firstString(fields[OPCIONES_COTIZACION_FIELDS.opcion], record.id),
    nombre: productoDescripcion,
    descripcion: productoDescripcion,
    fotos: attachmentList(fields[OPCIONES_COTIZACION_FIELDS.fotos]),
    proveedor: firstString(fields[OPCIONES_COTIZACION_FIELDS.proveedor]),
    proveedorRecordIds: linkedIds(fields[OPCIONES_COTIZACION_FIELDS.proveedor]),
    urlProveedor: firstString(fields[OPCIONES_COTIZACION_FIELDS.urlProveedor]),
    costoProveedor: firstNumber(fields[OPCIONES_COTIZACION_FIELDS.costoProveedor]),
    fleteEstimado: null,
    arancelImpuestos: null,
    otrosCostos: null,
    costoRealTotal: null,
    precioVentaCliente: firstNumber(fields[OPCIONES_COTIZACION_FIELDS.precioVentaCliente]),
    gananciaEstimada: firstNumber(fields[OPCIONES_COTIZACION_FIELDS.gananciaEstimada]),
    tiempoEstimado: firstString(fields[OPCIONES_COTIZACION_FIELDS.tiempoEstimado]),
    estado,
    seleccionadaPorCliente,
    itemPedidoGeneradoIds,
    notaInterna: firstString(fields[OPCIONES_COTIZACION_FIELDS.observacionesInternas]),
    notaParaCliente: firstString(fields[OPCIONES_COTIZACION_FIELDS.notaParaCliente]),
    fechaCreacion: record.createdTime ?? "",
    ultimaActualizacion: "",
  };
}

function mapProveedorCotizacion(record: AirtableRecord): ProveedorCotizacion {
  return {
    id: record.id,
    nombre: firstString(record.fields["Nombre"], record.id),
    direccion: normalizeProveedorDireccion(record.fields["Dirección"]),
  };
}

function mapAbono(record: AirtableRecord): AbonoCotizacion {
  const fields = record.fields;
  return {
    id: record.id,
    cotizacionRecordIds: linkedIds(fields["Cotización"]),
    itemPedidoId: firstString(fields["Item Pedido ID"]),
    clienteNombre: firstString(fields["Cliente Nombre"]),
    fechaAbono: firstString(fields["Fecha de Abono"], record.createdTime ?? ""),
    monto: firstNumber(fields["Monto"]),
    metodoPago: firstString(fields["Método de Pago"], "Otro"),
    cuentaDestino: firstString(fields["Cuenta Destino"], ""),
    comprobante: attachmentList(fields["Comprobante"]),
    numeroTransaccion: firstString(fields["Número de Transacción"]),
    registradoPor: firstString(fields["Registrado Por"]),
    estado: firstString(fields["Estado del Abono"], "Registrado"),
    estadoFinanciero: firstString(fields["Estado Financiero"], "Pendiente de registrar"),
    observacion: firstString(fields["Observación"]),
    creado: firstString(fields["Creado"], record.createdTime ?? ""),
  };
}

function mapCotizacionDetalle(
  record: AirtableRecord,
  opciones: OpcionCotizacion[],
  abonos: AbonoCotizacion[] = []
): CotizacionDetalle {
  const base = mapCotizacion(record);
  const fields = record.fields;
  return {
    ...base,
    clienteRecordId: firstString(fields["Cliente Record ID"]),
    clienteTelefono: firstString(fields["Cliente Teléfono"]),
    clienteEmail: firstString(fields["Cliente Email"]),
    clienteCedula: firstString(fields["Cliente Cédula"]),
    descripcionRequerimiento: firstString(fields["Descripción del Requerimiento"]),
    requiereInstalacion: boolValue(fields["Requiere Instalación"]),
    equipoYaEstaEnTienda: boolValue(fields["Equipo ya está en tienda"]),
    ordenReparacionId: firstString(fields["Orden Reparación ID"]),
    ordenReparacionCodigo: firstString(fields["Orden Reparación Código"]),
    itemPedidoId: firstString(fields["Item Pedido ID"]),
    registradoPor: firstString(fields["Registrado Por"]),
    ultimaActualizacion: firstString(fields["Última Actualización"]),
    observacionInterna: firstString(fields["Observación Interna"]),
    opciones,
    abonos,
  };
}

async function airtableRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const { client } = airtableUrl(COTIZACIONES_TABLES.cotizaciones);
  const response = await fetch(url, {
    ...init,
    headers: {
      ...client.headers,
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable error ${response.status}: ${text}`);
  }

  return (await response.json()) as T;
}

export async function fetchCotizaciones({
  estado,
  q,
}: {
  estado?: string | null;
  q?: string | null;
} = {}) {
  const { client, url } = airtableUrl(COTIZACIONES_TABLES.cotizaciones);
  const records: AirtableRecord[] = [];
  let offset: string | null = null;
  const formulas = [];
  const normalizedEstado = estado && estado !== "Todos" ? estado : "";
  const searchFormula = buildSearchFormula(q ?? "");

  if (normalizedEstado) formulas.push(`{Estado Cotización} = '${escapeFormulaString(normalizedEstado)}'`);
  if (searchFormula) formulas.push(searchFormula);

  do {
    const pageUrl = new URL(url);
    pageUrl.searchParams.set("pageSize", "100");
    if (offset) pageUrl.searchParams.set("offset", offset);
    if (formulas.length === 1) pageUrl.searchParams.set("filterByFormula", formulas[0]);
    if (formulas.length > 1) pageUrl.searchParams.set("filterByFormula", `AND(${formulas.join(",")})`);

    const data = await airtableRequest<AirtableListResponse>(pageUrl.toString(), {
      headers: client.headers,
    });
    records.push(...(data.records ?? []));
    offset = data.offset ?? null;
  } while (offset);

  return records
    .sort((a, b) => (b.createdTime ?? "").localeCompare(a.createdTime ?? ""))
    .map(mapCotizacion);
}

export function summarizeCotizaciones(items: CotizacionListado[]): CotizacionResumenEstado {
  return ESTADOS_COTIZACION.reduce((acc, estado) => {
    acc[estado] = items.filter((item) => item.estado === estado).length;
    return acc;
  }, {} as CotizacionResumenEstado);
}

export async function fetchCotizacionById(id: string): Promise<CotizacionDetalle | null> {
  const record = await fetchCotizacionRecord(id);
  if (!record) return null;
  const codigo = firstString(record.fields["Código Cotización"], record.id);
  const [opcionesNuevas, abonos] = await Promise.all([
    fetchOpcionesCotizacion(id, codigo),
    fetchAbonosCotizacion(id, codigo),
  ]);
  const opciones =
    opcionesNuevas.length > 0 ? opcionesNuevas : await fetchOpcionesLegacyDesdeItem(id, codigo);
  return mapCotizacionDetalle(record, opciones, abonos);
}

async function fetchCotizacionRecord(id: string): Promise<AirtableRecord | null> {
  const { client, url } = airtableUrl(COTIZACIONES_TABLES.cotizaciones, id);
  const response = await fetch(url, { headers: client.headers, cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable error ${response.status}: ${text}`);
  }
  return (await response.json()) as AirtableRecord;
}

export async function createCotizacion(input: CrearCotizacionInput) {
  const { client, url } = airtableUrl(COTIZACIONES_TABLES.cotizaciones);
  const fields: Record<string, unknown> = {
    "Cliente Record ID": input.cliente.recordId,
    "Cliente Nombre": input.cliente.nombre,
    "Cliente Teléfono": input.cliente.telefono,
    "Cliente Email": input.cliente.email,
    "Cliente Cédula": input.cliente.cedula,
    "Producto Solicitado": input.productoSolicitado,
    "Estado Cotización": "Pendiente",
    "Requiere Instalación": Boolean(input.requiereInstalacion),
    "Equipo ya está en tienda": Boolean(input.equipoYaEstaEnTienda),
    "Registrado Por": input.registradoPor,
  };

  if (input.categoria) fields["Categoría"] = input.categoria;
  if (input.descripcionRequerimiento) {
    fields["Descripción del Requerimiento"] = input.descripcionRequerimiento;
  }
  if (input.observacionInterna) fields["Observación Interna"] = input.observacionInterna;

  const data = await airtableRequest<AirtableRecord>(url, {
    method: "POST",
    headers: client.headers,
    body: JSON.stringify({ fields }),
  });
  return mapCotizacionDetalle(data, [], []);
}

export async function updateCotizacionEstado(id: string, estado: EstadoCotizacion | string) {
  const { client, url } = airtableUrl(COTIZACIONES_TABLES.cotizaciones, id);
  const data = await airtableRequest<AirtableRecord>(url, {
    method: "PATCH",
    headers: client.headers,
    body: JSON.stringify({
      fields: {
        "Estado Cotización": estado,
      },
    }),
  });
  const codigo = firstString(data.fields["Código Cotización"], data.id);
  const [opciones, abonos] = await Promise.all([
    fetchOpcionesCotizacion(id, codigo),
    fetchAbonosCotizacion(id, codigo),
  ]);
  return mapCotizacionDetalle(data, opciones, abonos);
}

async function patchCotizacion(id: string, fields: Record<string, unknown>) {
  const { client, url } = airtableUrl(COTIZACIONES_TABLES.cotizaciones, id);
  const data = await airtableRequest<AirtableRecord>(url, {
    method: "PATCH",
    headers: client.headers,
    body: JSON.stringify({ fields }),
  });
  const codigo = firstString(data.fields["Código Cotización"], data.id);
  const [opciones, abonos] = await Promise.all([
    fetchOpcionesCotizacion(id, codigo),
    fetchAbonosCotizacion(id, codigo),
  ]);
  return mapCotizacionDetalle(data, opciones, abonos);
}

export async function fetchOpcionesCotizacion(cotizacionId: string, codigoCotizacion?: string) {
  const { client, url } = airtableUrl(COTIZACIONES_TABLES.opciones);
  const pageUrl = new URL(url);
  pageUrl.searchParams.set("pageSize", "100");
  const filters = [`FIND('${escapeFormulaString(cotizacionId)}', ARRAYJOIN({Cotización}))`];
  if (codigoCotizacion) {
    filters.push(`FIND('${escapeFormulaString(codigoCotizacion)}', ARRAYJOIN({Cotización}))`);
  }
  pageUrl.searchParams.set("filterByFormula", filters.length > 1 ? `OR(${filters.join(",")})` : filters[0]);

  const data = await airtableRequest<AirtableListResponse>(pageUrl.toString(), {
    headers: client.headers,
  });

  return (data.records ?? [])
    .sort((a, b) => (a.createdTime ?? "").localeCompare(b.createdTime ?? ""))
    .map(mapOpcion);
}

async function fetchOpcionesLegacyDesdeItem(cotizacionId: string, codigoCotizacion?: string) {
  const { client, url } = airtableUrl(COTIZACIONES_TABLES.item);
  const pageUrl = new URL(url);
  const cotizacionFilters = [`({Cotización ID} & '') = '${escapeFormulaString(cotizacionId)}'`];
  if (codigoCotizacion) {
    cotizacionFilters.push(`({Cotización Código} & '') = '${escapeFormulaString(codigoCotizacion)}'`);
  }
  pageUrl.searchParams.set("pageSize", "100");
  pageUrl.searchParams.set(
    "filterByFormula",
    `AND(OR(${cotizacionFilters.join(",")}), NOT({Item Para} = 'Pedido'))`
  );

  try {
    const data = await airtableRequest<AirtableListResponse>(pageUrl.toString(), {
      headers: client.headers,
    });
    return (data.records ?? []).map(mapOpcionLegacyDesdeItem);
  } catch (error) {
    console.warn("No se pudieron leer opciones antiguas desde Item:", error);
    return [];
  }
}

function mapOpcionLegacyDesdeItem(record: AirtableRecord): OpcionCotizacion {
  const fields = record.fields;
  const item = firstString(fields["Item"], "Opción antigua");
  return {
    id: record.id,
    opcion: firstString(fields["Código"], record.id),
    nombre: item,
    descripcion: firstString(fields["Nota Pública"]) || firstString(fields["Nota Interna"]) || item,
    fotos: attachmentList(fields["Fotos"]),
    proveedor: firstString(fields["Proveedor"]),
    proveedorRecordIds: linkedIds(fields["Proveedor"]),
    urlProveedor: firstString(fields["URL Proveedor"]),
    costoProveedor: firstNumber(fields["Costo Proveedor"]),
    fleteEstimado: firstNumber(fields["Flete Estimado"]),
    arancelImpuestos: firstNumber(fields["Arancel (Item Solo)"]),
    otrosCostos: null,
    costoRealTotal: null,
    precioVentaCliente: firstNumber(fields["Precio Venta"]),
    gananciaEstimada: firstNumber(fields["Ganancia"]),
    tiempoEstimado: "",
    estado: firstString(fields["Estados Pedido"]) || "Opción antigua",
    seleccionadaPorCliente: false,
    itemPedidoGeneradoIds: [],
    notaInterna: firstString(fields["Nota Interna"]),
    notaParaCliente: firstString(fields["Nota Pública"]),
    fechaCreacion: record.createdTime ?? "",
    ultimaActualizacion: "",
  };
}

export async function fetchProveedoresCotizacion(): Promise<ProveedorCotizacion[]> {
  const { client, url } = airtableUrl(COTIZACIONES_TABLES.proveedores);
  const records: AirtableRecord[] = [];
  let offset: string | null = null;

  do {
    const pageUrl = new URL(url);
    pageUrl.searchParams.set("pageSize", "100");
    pageUrl.searchParams.append("sort[0][field]", "Nombre");
    pageUrl.searchParams.append("sort[0][direction]", "asc");
    if (offset) pageUrl.searchParams.set("offset", offset);

    const data = await airtableRequest<AirtableListResponse>(pageUrl.toString(), {
      headers: client.headers,
    });
    records.push(...(data.records ?? []));
    offset = data.offset ?? null;
  } while (offset);

  return records.map(mapProveedorCotizacion);
}

export async function createOpcionCotizacion(input: CrearOpcionCotizacionInput) {
  if (!input.proveedorId) {
    throw new Error("Selecciona el proveedor de la opción.");
  }

  const availableFields = await getOpcionesCotizacionFields();
  if (availableFields) {
    const missingFields = OPCIONES_COTIZACION_REQUIRED_CREATE_FIELDS.filter(
      (fieldName) => !availableFields.has(fieldName)
    );
    if (missingFields.length > 0) {
      throw new Error(
        `Faltan campos obligatorios en Airtable para Opciones de Cotización: ${missingFields.join(", ")}.`
      );
    }
  }

  const { client, url } = airtableUrl(COTIZACIONES_TABLES.opciones);
  const fields: Record<string, unknown> = {
    [OPCIONES_COTIZACION_FIELDS.cotizacion]: [input.cotizacionId],
    [OPCIONES_COTIZACION_FIELDS.proveedor]: [input.proveedorId],
    [OPCIONES_COTIZACION_FIELDS.productoDescripcion]: input.productoDescripcion,
  };

  if (input.costoProveedor !== null && input.costoProveedor !== undefined) {
    fields[OPCIONES_COTIZACION_FIELDS.costoProveedor] = input.costoProveedor;
  }
  if (input.precioVentaCliente !== null && input.precioVentaCliente !== undefined) {
    fields[OPCIONES_COTIZACION_FIELDS.precioVentaCliente] = input.precioVentaCliente;
  }

  addOptionalAirtableField(
    fields,
    availableFields,
    resolveOpcionEstadoFieldName(availableFields),
    ESTADOS_OPCION_AIRTABLE.disponible
  );
  addOptionalAirtableField(
    fields,
    availableFields,
    OPCIONES_COTIZACION_FIELDS.opcionElegida,
    false
  );
  addOptionalAirtableField(fields, availableFields, OPCIONES_COTIZACION_FIELDS.urlProveedor, input.urlProveedor);
  addOptionalAirtableField(fields, availableFields, OPCIONES_COTIZACION_FIELDS.tiempoEstimado, input.tiempoEstimado);
  addOptionalAirtableField(
    fields,
    availableFields,
    OPCIONES_COTIZACION_FIELDS.observacionesInternas,
    input.notaInterna
  );
  addOptionalAirtableField(
    fields,
    availableFields,
    OPCIONES_COTIZACION_FIELDS.notaParaCliente,
    input.notaParaCliente
  );

  const data = await airtableRequest<AirtableRecord>(url, {
    method: "POST",
    headers: client.headers,
    body: JSON.stringify({ fields }),
  });

  return mapOpcion(data);
}

export async function addFotosToOpcionCotizacion(
  opcionId: string,
  fotos: Array<{ filename: string; contentType: string; fileBase64: string }>
): Promise<{ opcion: OpcionCotizacion; warning?: string | null }> {
  if (!opcionId) {
    throw new Error("Falta id de opción de cotización.");
  }
  if (!fotos.length) {
    const { client, url } = airtableUrl(COTIZACIONES_TABLES.opciones, opcionId);
    const option = await airtableRequest<AirtableRecord>(url, { headers: client.headers });
    return { opcion: mapOpcion(option), warning: null };
  }

  const availableFields = await getOpcionesCotizacionFields();
  if (!fieldExists(availableFields, OPCIONES_COTIZACION_FIELDS.fotos)) {
    const { client, url } = airtableUrl(COTIZACIONES_TABLES.opciones, opcionId);
    const option = await airtableRequest<AirtableRecord>(url, { headers: client.headers });
    return {
      opcion: mapOpcion(option),
      warning: `No se subieron fotos porque no existe el campo ${OPCIONES_COTIZACION_FIELDS.fotos}.`,
    };
  }

  const failedFiles: string[] = [];

  for (const foto of fotos) {
    try {
      await uploadAttachmentToRecord({
        recordId: opcionId,
        attachmentFieldIdOrName: OPCIONES_COTIZACION_FIELDS.fotos,
        filename: foto.filename,
        contentType: foto.contentType,
        fileBase64: foto.fileBase64,
      });
    } catch (error) {
      console.error("No se pudo agregar foto a la opción de cotización:", error);
      failedFiles.push(foto.filename);
    }
  }

  if (failedFiles.length === fotos.length) {
    throw new Error("No se pudo subir ninguna foto.");
  }

  const { client, url } = airtableUrl(COTIZACIONES_TABLES.opciones, opcionId);
  const option = await airtableRequest<AirtableRecord>(url, { headers: client.headers });

  return {
    opcion: mapOpcion(option),
    warning: failedFiles.length > 0 ? `No se pudieron subir: ${failedFiles.join(", ")}.` : null,
  };
}

export async function replaceFotosOpcionCotizacion(
  opcionId: string,
  fotosExistentes: AirtableAttachment[],
  fotosNuevas: Array<{ filename: string; contentType: string; fileBase64: string }>
) {
  const current = await fetchOpcionCotizacionById(opcionId);
  if (!current) {
    throw new Error("Opción de cotización no encontrada.");
  }
  if (current.itemPedidoGeneradoIds.length > 0) {
    throw new Error("No se puede editar una opción que ya fue convertida en pedido.");
  }

  const availableFields = await getOpcionesCotizacionFields();
  if (!fieldExists(availableFields, OPCIONES_COTIZACION_FIELDS.fotos)) {
    throw new Error("No se pudieron guardar las fotos. Intenta nuevamente.");
  }

  const currentUrls = new Set(current.fotos.map((foto) => foto.url));
  const failedFiles: string[] = [];

  for (const foto of fotosNuevas) {
    try {
      await uploadAttachmentToRecord({
        recordId: opcionId,
        attachmentFieldIdOrName: OPCIONES_COTIZACION_FIELDS.fotos,
        filename: foto.filename,
        contentType: foto.contentType,
        fileBase64: foto.fileBase64,
      });
    } catch (error) {
      console.error("No se pudo guardar foto de la opción de cotización:", error);
      failedFiles.push(foto.filename);
    }
  }

  if (failedFiles.length > 0) {
    throw new Error("No se pudieron guardar las fotos. Intenta nuevamente.");
  }

  const latest = fotosNuevas.length > 0 ? await fetchOpcionCotizacionById(opcionId) : current;
  const uploadedFotos = (latest?.fotos ?? []).filter((foto) => !currentUrls.has(foto.url));
  const finalFotos = [...fotosExistentes, ...uploadedFotos].map((foto) => ({
    ...(foto.id ? { id: foto.id } : { url: foto.url }),
    ...(foto.filename ? { filename: foto.filename } : {}),
  }));

  return patchOpcion(opcionId, {
    [OPCIONES_COTIZACION_FIELDS.fotos]: finalFotos,
  });
}

async function patchOpcion(id: string, fields: Record<string, unknown>) {
  const { client, url } = airtableUrl(COTIZACIONES_TABLES.opciones, id);
  const data = await airtableRequest<AirtableRecord>(url, {
    method: "PATCH",
    headers: client.headers,
    body: JSON.stringify({ fields }),
  });
  return mapOpcion(data);
}

export async function fetchOpcionCotizacionById(id: string) {
  const { client, url } = airtableUrl(COTIZACIONES_TABLES.opciones, id);
  const response = await fetch(url, { headers: client.headers, cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable error ${response.status}: ${text}`);
  }
  return mapOpcion((await response.json()) as AirtableRecord);
}

export async function updateOpcionCotizacion(
  id: string,
  input: ActualizarOpcionCotizacionInput
) {
  const current = await fetchOpcionCotizacionById(id);
  if (!current) {
    throw new Error("Opción de cotización no encontrada.");
  }
  if (current.itemPedidoGeneradoIds.length > 0) {
    throw new Error("No se puede editar una opción que ya fue convertida en pedido.");
  }

  const availableFields = await getOpcionesCotizacionFields();
  const fields: Record<string, unknown> = {};

  const setIfExists = (fieldName: string, value: unknown) => {
    if (value === undefined || !fieldExists(availableFields, fieldName)) return;
    fields[fieldName] = value;
  };

  setIfExists(OPCIONES_COTIZACION_FIELDS.productoDescripcion, input.productoDescripcion ?? undefined);
  if (input.proveedorId !== undefined) {
    setIfExists(OPCIONES_COTIZACION_FIELDS.proveedor, input.proveedorId ? [input.proveedorId] : []);
  }
  setIfExists(OPCIONES_COTIZACION_FIELDS.urlProveedor, input.urlProveedor ?? undefined);
  setIfExists(OPCIONES_COTIZACION_FIELDS.tiempoEstimado, input.tiempoEstimado ?? undefined);
  setIfExists(OPCIONES_COTIZACION_FIELDS.costoProveedor, input.costoProveedor ?? undefined);
  setIfExists(OPCIONES_COTIZACION_FIELDS.precioVentaCliente, input.precioVentaCliente ?? undefined);
  setIfExists(OPCIONES_COTIZACION_FIELDS.observacionesInternas, input.notaInterna ?? undefined);
  setIfExists(OPCIONES_COTIZACION_FIELDS.notaParaCliente, input.notaParaCliente ?? undefined);
  if (input.estado !== undefined) {
    setIfExists(resolveOpcionEstadoFieldName(availableFields), input.estado);
  }

  if (Object.keys(fields).length === 0) return current;
  return patchOpcion(id, fields);
}

export async function deleteOpcionCotizacion(id: string) {
  const current = await fetchOpcionCotizacionById(id);
  if (!current) {
    throw new Error("Opción de cotización no encontrada.");
  }
  if (current.itemPedidoGeneradoIds.length > 0) {
    throw new Error("No se puede eliminar una opción que ya fue convertida en pedido.");
  }

  const { client, url } = airtableUrl(COTIZACIONES_TABLES.opciones, id);
  await airtableRequest<AirtableRecord>(url, {
    method: "DELETE",
    headers: client.headers,
  });
}

async function addSeleccionadaPorClienteField(fields: Record<string, unknown>, value: boolean) {
  if (
    await airtableTableHasField(
      COTIZACIONES_TABLES.opciones,
      OPCIONES_COTIZACION_FIELDS.opcionElegida
    )
  ) {
    fields[OPCIONES_COTIZACION_FIELDS.opcionElegida] = value;
  }
  return fields;
}

export async function seleccionarOpcionCotizacion(cotizacionId: string, opcionId: string) {
  const cotizacion = await fetchCotizacionRecord(cotizacionId);
  const codigo = cotizacion ? firstString(cotizacion.fields["Código Cotización"], cotizacion.id) : "";
  const opciones = await fetchOpcionesCotizacion(cotizacionId, codigo);
  const availableFields = await getOpcionesCotizacionFields();
  const estadoFieldName = resolveOpcionEstadoFieldName(availableFields);

  await Promise.all(
    opciones
      .filter((opcion) => opcion.id !== opcionId && opcion.seleccionadaPorCliente)
      .map(async (opcion) => {
        const fields: Record<string, unknown> = {};
        if (
          opcion.estado === ESTADOS_OPCION_AIRTABLE.seleccionada &&
          fieldExists(availableFields, estadoFieldName)
        ) {
          fields[estadoFieldName] =
            ESTADOS_OPCION_AIRTABLE.ofrecidaAlCliente;
        }
        await addSeleccionadaPorClienteField(fields, false);
        if (Object.keys(fields).length === 0) return opcion;
        return patchOpcion(opcion.id, fields);
      })
  );

  const selectedFields: Record<string, unknown> = {};
  if (fieldExists(availableFields, estadoFieldName)) {
    selectedFields[estadoFieldName] = ESTADOS_OPCION_AIRTABLE.seleccionada;
  }
  await addSeleccionadaPorClienteField(selectedFields, true);
  const selected =
    Object.keys(selectedFields).length > 0
      ? await patchOpcion(opcionId, selectedFields)
      : opciones.find((opcion) => opcion.id === opcionId);

  if (!selected) {
    throw new Error("Opción de cotización no encontrada.");
  }

  const totalAbonado = firstNumber(cotizacion?.fields["Total Abonado"]) ?? 0;
  const updatedCotizacion = await patchCotizacion(cotizacionId, {
    "Estado Cotización": "Aprobada",
    "Total Cotizado": selected.precioVentaCliente ?? 0,
    "Opción Elegida": [opcionId],
  });
  return {
    selected,
    cotizacion: {
      ...updatedCotizacion,
      totalAbonado: updatedCotizacion.totalAbonado ?? totalAbonado,
      saldoPendiente:
        updatedCotizacion.saldoPendiente ??
        ((selected.precioVentaCliente ?? 0) - totalAbonado),
    },
  };
}

function buildLinkedCotizacionFilter(cotizacionId: string, codigoCotizacion?: string) {
  const filters = [`FIND('${escapeFormulaString(cotizacionId)}', ARRAYJOIN({Cotización}))`];
  if (codigoCotizacion) {
    filters.push(`FIND('${escapeFormulaString(codigoCotizacion)}', ARRAYJOIN({Cotización}))`);
  }
  return filters.length > 1 ? `OR(${filters.join(",")})` : filters[0];
}

export async function fetchAbonosCotizacion(cotizacionId: string, codigoCotizacion?: string) {
  const { client, url } = airtableUrl(COTIZACIONES_TABLES.abonos);
  const records: AirtableRecord[] = [];
  let offset: string | null = null;

  do {
    const pageUrl = new URL(url);
    pageUrl.searchParams.set("pageSize", "100");
    pageUrl.searchParams.set(
      "filterByFormula",
      `AND(${buildLinkedCotizacionFilter(cotizacionId, codigoCotizacion)}, {Estado del Abono} = 'Registrado')`
    );
    pageUrl.searchParams.append("sort[0][field]", "Fecha de Abono");
    pageUrl.searchParams.append("sort[0][direction]", "desc");
    if (offset) pageUrl.searchParams.set("offset", offset);

    const data = await airtableRequest<AirtableListResponse>(pageUrl.toString(), {
      headers: client.headers,
    });
    records.push(...(data.records ?? []));
    offset = data.offset ?? null;
  } while (offset);

  return records.map(mapAbono);
}

export async function createAbonoCotizacion(input: CrearAbonoCotizacionInput) {
  const cotizacion = await fetchCotizacionRecord(input.cotizacionId);
  if (!cotizacion) {
    throw new Error("Cotización no encontrada");
  }

  const { client, url } = airtableUrl(COTIZACIONES_TABLES.abonos);
  const fields: Record<string, unknown> = {
    "Cotización": [input.cotizacionId],
    "Cliente Nombre": input.clienteNombre,
    "Fecha de Abono": input.fechaAbono || new Date().toISOString(),
    "Monto": input.monto,
    "Método de Pago": input.metodoPago,
    "Registrado Por": input.registradoPor,
    "Estado del Abono": "Registrado",
    "Estado Financiero": "Pendiente de registrar",
  };

  if (input.itemPedidoId) fields["Item Pedido ID"] = input.itemPedidoId;
  if (input.cuentaDestino) fields["Cuenta Destino"] = input.cuentaDestino;
  if (input.numeroTransaccion) fields["Número de Transacción"] = input.numeroTransaccion;
  if (input.observacion) fields["Observación"] = input.observacion;

  const created = await airtableRequest<AirtableRecord>(url, {
    method: "POST",
    headers: client.headers,
    body: JSON.stringify({ fields }),
  });

  const codigo = firstString(cotizacion.fields["Código Cotización"], cotizacion.id);
  const abonos = await fetchAbonosCotizacion(input.cotizacionId, codigo);
  const totalAbonado = abonos.reduce((sum, abono) => sum + (abono.monto ?? 0), 0);
  const updatedCotizacion = await patchCotizacion(input.cotizacionId, {
    "Total Abonado": totalAbonado,
  });

  return {
    abono: mapAbono(created),
    abonos,
    cotizacion: {
      ...updatedCotizacion,
      totalAbonado,
      saldoPendiente:
        updatedCotizacion.saldoPendiente ??
        ((updatedCotizacion.totalCotizado ?? 0) - totalAbonado),
    },
  };
}

export async function convertirCotizacionEnPedido(
  cotizacionId: string,
  input: { skuInterno: string; skuProveedor?: string | null }
) {
  const cotizacion = await fetchCotizacionById(cotizacionId);

  if (!cotizacion) {
    throw new Error("Cotización no encontrada.");
  }

  if (cotizacion.itemPedidoId) {
    throw new Error(`Esta cotización ya fue convertida en pedido (${cotizacion.itemPedidoId}).`);
  }

  if (cotizacion.estado !== "Aprobada") {
    throw new Error("La cotización debe estar en estado Aprobada para convertirla en pedido.");
  }

  const selectedOption = cotizacion.opciones.find((opcion) => opcion.seleccionadaPorCliente);
  if (!selectedOption) {
    throw new Error("Selecciona una opción antes de convertir la cotización en pedido.");
  }

  const proveedorId = selectedOption.proveedorRecordIds[0];
  if (!proveedorId) {
    throw new Error("La opción seleccionada no tiene proveedor registrado.");
  }

  const registeredAbonos = cotizacion.abonos.filter((abono) => abono.estado === "Registrado");
  if (registeredAbonos.length === 0 || registeredAbonos.reduce((sum, abono) => sum + (abono.monto ?? 0), 0) <= 0) {
    throw new Error("Registra al menos un abono antes de convertir la cotización en pedido.");
  }

  const skuInterno = normalizeSku(input.skuInterno);
  const skuValidation = await validateSkuForItem({ sku: skuInterno });
  if (!skuValidation.valid) {
    throw new Error(skuValidation.message || "El SKU interno no es válido.");
  }

  const { client, url } = airtableUrl(COTIZACIONES_TABLES.item);
  const fields: Record<string, unknown> = {
    "Item Para": "Pedido",
    "Item": selectedOption.nombre || cotizacion.productoSolicitado,
    "Categoria": mapCategoriaCotizacionToItem(cotizacion.categoria),
    "Identificador": skuInterno,
    "Precio Venta": selectedOption.precioVentaCliente ?? cotizacion.totalCotizado ?? 0,
    "Costo Proveedor": selectedOption.costoProveedor ?? 0,
    "Proveedor": [proveedorId],
    "Fotos": selectedOption.fotos.map((foto) => ({
      url: foto.url,
      ...(foto.filename ? { filename: foto.filename } : {}),
    })),
    "Cotización ID": cotizacion.id,
    "Cotización Código": cotizacion.codigo,
    "Opción Cotización ID": selectedOption.id,
    "Cliente Record ID Reparaciones": cotizacion.clienteRecordId,
    "Cliente Nombre Snapshot": cotizacion.clienteNombre,
    "Cliente Teléfono Snapshot": cotizacion.clienteTelefono,
    "Requiere Instalación": cotizacion.requiereInstalacion,
    "Estado Instalación": cotizacion.requiereInstalacion ? "Pendiente de crear orden" : "No requiere",
  };

  if (selectedOption.notaParaCliente) {
    fields["Nota Pública"] = selectedOption.notaParaCliente;
  }
  if (selectedOption.notaInterna) {
    fields["Nota Interna"] = selectedOption.notaInterna;
  }
  if (cotizacion.clienteRecordId && (await airtableTableHasField(COTIZACIONES_TABLES.item, "Clientes"))) {
    fields["Clientes"] = [cotizacion.clienteRecordId];
  }

  const skuProveedor = normalizeSku(input.skuProveedor || "");
  if (skuProveedor) {
    fields["SKU Proveedor"] = skuProveedor;
  }

  const item = await airtableRequest<AirtableRecord>(url, {
    method: "POST",
    headers: client.headers,
    body: JSON.stringify({ fields }),
  });

  const availableOptionFields = await getOpcionesCotizacionFields();
  const selectedOptionFields: Record<string, unknown> = {};
  const estadoFieldName = resolveOpcionEstadoFieldName(availableOptionFields);
  if (fieldExists(availableOptionFields, estadoFieldName)) {
    selectedOptionFields[estadoFieldName] = ESTADOS_OPCION_AIRTABLE.seleccionada;
  }
  addOptionalAirtableField(
    selectedOptionFields,
    availableOptionFields,
    OPCIONES_COTIZACION_FIELDS.itemPedidoGenerado,
    [item.id]
  );
  await addSeleccionadaPorClienteField(selectedOptionFields, true);
  if (Object.keys(selectedOptionFields).length > 0) {
    await patchOpcion(selectedOption.id, selectedOptionFields);
  }

  const updatedCotizacion = await patchCotizacion(cotizacionId, {
    "Estado Cotización": "Convertida en Pedido",
    "Opción Elegida": [selectedOption.id],
    "Pedido Generado": [item.id],
  });

  return {
    itemId: item.id,
    cotizacion: updatedCotizacion,
  };
}

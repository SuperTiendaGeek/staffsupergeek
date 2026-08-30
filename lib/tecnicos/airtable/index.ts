import { AIRTABLE_TABLES, loadAirtableEnv } from "../config/airtable";
import { reservarSiguienteIdAbono } from "@/lib/operaciones/airtable";
import { normalizeCedula } from "@/lib/clientes/normalizeCedula";
import {
  ESTADOS_ORDEN,
  EstadoOrden,
  TipoOrden,
  HistorialEstado,
  RepuestoUsado,
  ServicioOrden,
  RepuestoPorOrden,
  ServicioPorOrden,
  CatalogoRepuesto,
  CatalogoServicio,
  AbonoPorOrden,
  AbonoComprobanteAdjunto,
  AirtableAttachment,
} from "@/types/tecnicos";
import { etiquetaAirtable, codigoDesdeAirtable } from "@/lib/facturacion/reglas/identificacion";

// Attachment mínimo (id + url) usado para adjuntos simples de un campo.
export interface AirtableSimpleAttachment {
  id: string | null;
  url: string;
  filename: string | null;
}

// Cliente base para server actions o rutas /api sin exponer credenciales.
export interface AirtableClient {
  baseUrl: string;
  headers: HeadersInit;
  baseId: string;
}

// Listado
export interface OrdenListado {
  recordId: string; // id interno de Airtable para navegaciÃ³n
  idVisible: string; // campo "ID" visible
  clienteNombre: string;
  telefono: string;
  equipo: string;
  ingresaPor: string;
  estadoActual: EstadoOrden | string;
  fechaIngreso: string;
  ultimaModificacion: string;
}

export interface OrdenesPageResult {
  records: OrdenListado[];
  nextOffset: string | null;
  pageSize: number;
  hasNext: boolean;
  riskSummary: OrdenesRiskSummary;
  statusCounts: OrdenesStatusCounts;
}

export interface ClienteBusqueda {
  id: string;
  nombre: string;
  cedula: string;
  /**
   * Código SRI del documento: "04" RUC · "05" cédula · "06" pasaporte ·
   * "08" identificación del exterior. Cadena vacía en fichas anteriores al
   * campo "Cliente - Tipo Identificación".
   *
   * Se GUARDA en vez de deducirse por la longitud: esa deducción fue la que
   * marcó como pasaporte una cédula de nueve dígitos y dejó salir la factura
   * 001-002-000000689 (8-ago-2026).
   */
  tipoIdentificacion: string;
  telefono: string;
  correo: string;
  direccion: string;
  notas?: string | null;
}

export interface ClienteListado extends ClienteBusqueda {
  numeroOrdenes: number | null;
  ultimaFechaIngreso: string;
}

export interface ClienteDetalle extends ClienteListado {
  notas: string | null;
  ordenesRelacionadas: string[];
}

export interface OrdenClienteListado {
  recordId: string;
  idVisible: string;
  equipo: string;
  fechaIngreso: string;
  estadoActual: EstadoOrden | string;
}

export interface ClientesPageResult {
  records: ClienteListado[];
  nextOffset: string | null;
  pageSize: number;
  hasNext: boolean;
}

export interface NuevoClienteInput {
  nombre: string;
  cedula?: string | null;
  /** Código SRI: "04" "05" "06" "08". Ver ClienteBusqueda.tipoIdentificacion. */
  tipoIdentificacion?: string | null;
  telefono?: string | null;
  correo?: string | null;
  direccion?: string | null;
  notas?: string | null;
}

export class CedulaEnUsoError extends Error {
  clienteExistente: ClienteBusqueda | null;
  constructor(clienteExistente: ClienteBusqueda | null = null, message = "Ya existe un cliente registrado con esta cédula.") {
    super(message);
    this.name = "CedulaEnUsoError";
    this.clienteExistente = clienteExistente;
  }
}

const findClienteByCedulaNormalizada = async (
  normalizedCedula: string,
  excludeRecordId?: string
): Promise<ClienteBusqueda | null> => {
  if (!normalizedCedula) return null;

  const client = getClient();
  const fieldVariants = [["Cédula"], ["Cedula"]];
  let lastError: Error | null = null;

  for (const [cedulaField] of fieldVariants) {
    const formula = `LOWER(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE({${cedulaField}}, " ", ""), ".", ""), "-", "")) = "${escapeAirtableFormulaString(normalizedCedula)}"`;
    const url = new URL(`${client.baseUrl}/${encodeURIComponent(AIRTABLE_TABLES.clientes)}`);
    url.searchParams.set("pageSize", "1");
    url.searchParams.set("filterByFormula", formula);

    const res = await fetch(url.toString(), { headers: client.headers, cache: "no-store" });

    if (res.ok) {
      const data = (await res.json()) as { records?: AirtableGenericRecord[] };
      const record = data.records?.[0];
      if (!record) return null;
      if (excludeRecordId && record.id === excludeRecordId) return null;
      return mapClienteRecord(record);
    }

    const text = await res.text();
    const error = new Error(`Airtable error ${res.status}: ${text}`);
    lastError = error;
    if (!isUnknownAirtableFieldError(error.message)) throw error;
  }

  throw lastError ?? new Error("No se pudo validar duplicados de cédula");
};

export const assertCedulaDisponible = async (
  cedula: string,
  excludeRecordId?: string
): Promise<void> => {
  const normalized = normalizeCedula(cedula);
  if (!normalized) return;
  const existente = await findClienteByCedulaNormalizada(normalized, excludeRecordId);
  if (existente) {
    throw new CedulaEnUsoError(existente);
  }
};

export interface BuscarClienteDuplicadoInput {
  cedula?: string | null;
  telefono?: string | null;
}

export interface NuevaOrdenInput {
  clienteId?: string | null;
  nuevoCliente?: NuevoClienteInput | null;
  orden: {
    equipo: string;
    accesorios?: string | null;
    ingresaPor: string;
  };
}

export interface OrdenCreadaResult {
  ok: true;
  ordenId: string;
  airtableRecordId: string;
}

export interface FetchOrdenesPageOptions {
  pageSize?: number;
  offset?: string | null;
  q?: string | null;
  estado?: string | null;
  risk?: OrdenesRiskFilter | null;
}

export type OrdenesRiskFilter = "warning" | "critical";

export interface OrdenesRiskSummary {
  warningCount: number;
  criticalCount: number;
}

export type OrdenesStatusCounts = Record<EstadoOrden, number>;

export interface FetchClientesPageOptions {
  pageSize?: number;
  offset?: string | null;
  q?: string | null;
}

// Catálogo maestro de productos digitales.
export interface CatalogoProductoDigital {
  id: string;
  productoBase: string;
  marca: string | null;
  tipo: string | null;
  portalActivacion: string | null;
  instruccionesPdf: string | null;
  notasParaCliente: string | null;
  precioVentaCatalogo: number | null;
  colorPrincipal: string | null;
  activo: boolean;
  logoUrl: string | null;
  // link (privado) se omite intencionalmente: nunca exponer a cliente ni PDF
}

// Detalle
// Producto digital del inventario. Las credenciales sensibles (clave, contraseña)
// nunca se incluyen aquí; se obtienen por un endpoint separado con sesión activa.
export interface ProductoDigital {
  id: string;
  catalogoId: string | null;
  softwareProducto: string;
  // Lookups del catálogo
  marcaProducto: string | null;
  tipoProducto: string | null;
  logoProductoUrl: string | null;
  portalActivacionCatalogo: string | null;
  instruccionesPdfCatalogo: string | null;
  notasParaClienteCatalogo: string | null;
  precioVentaCatalogo: number | null;
  colorPrincipalProducto: string | null;
  // Campos propios
  estado: string;
  proveedor: string | null;
  costoProveedor: number | null;
  precioVenta: number | null;
  claveTruncada: string | null;
  usuarioCorreo: string | null;
  duracion: string | null;
  expira: string | null;
  fechaCompra: string | null;
  fechaUsoVenta: string | null;
  ordenReparacionId: string | null;
  clienteId: string | null;
  tipoUso: string | null;
  usadoVendidoPor: string | null;
  observacionesInternas: string | null;
  // PDF audit
  documentoPdfUrl: string | null;
  documentoGeneradoPor: string | null;
  fechaUltimoPdf: string | null;
}

export interface OrdenDetalle {
  recordId: string;
  idVisible: string;
  estadoActual: EstadoOrden | string;
  fechaIngreso: string;
  ultimaModificacion: string;
  ingresaPor: string;
  tipoOrden: TipoOrden | string;
  clienteNombre: string;
  clienteRecordId: string | null;
  cedula: string;
  telefono: string;
  equipo: string;
  accesorios: string;
  diagnosticoInicial: string;
  notaInterna: string;
  recomendaciones: string;
  costoTotalServiciosNV: number | null;
  costoTotalRepuestosNV: number | null;
  totalProductosDigitalesNV: number | null;
  totalAPagarNV: number | null;
  totalAbonadoNV: number | null;
  saldoNV: number | null;
  historial: HistorialEstado[];
  repuestos: RepuestoUsado[];
  servicios: ServicioOrden[];
  repuestosPorOrden: RepuestoPorOrden[];
  serviciosPorOrden: ServicioPorOrden[];
  abonosPorOrden: AbonoPorOrden[];
  productosDigitales: ProductoDigital[];
  documentos: AirtableAttachment[];
  cotizacionId: string;
  cotizacionCodigo: string;
  /** Fecha (YYYY-MM-DD) impresa en la última etiqueta de mantenimiento de este equipo, si se ha impreso alguna. */
  proximoMantenimiento: string;
  /** true si ya se le avisó al cliente (WhatsApp) del mantenimiento de `proximoMantenimiento`. */
  mantenimientoNotificado: boolean;
}

/** Fila del listado de seguimiento de mantenimientos (/tecnicos/mantenimientos). */
export interface MantenimientoProximo {
  ordenRecordId: string;
  idVisible: string;
  clienteNombre: string;
  telefono: string;
  equipo: string;
  proximoMantenimiento: string;
  mantenimientoNotificado: boolean;
}

// Helpers
const getClient = (): AirtableClient => {
  const { token, baseId } = loadAirtableEnv();
  return {
    baseId,
    baseUrl: `https://api.airtable.com/v0/${baseId}`,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };
};

const safeString = (value: unknown, fallback = "No disponible"): string =>
  typeof value === "string" && value.trim() !== "" ? value : fallback;

const firstString = (value: unknown, fallback = "No disponible"): string => {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const found = value.find((v) => typeof v === "string");
    if (found) return found as string;
  }
  return fallback;
};

const pickStringField = (
  fields: Record<string, unknown>,
  keys: string[],
  fallback = "No disponible"
) => {
  for (const key of keys) {
    const candidate = fields[key];
    const value = firstString(candidate, "");
    if (value) return value;
  }
  return fallback;
};

const pickOptionalStringField = (
  fields: Record<string, unknown>,
  keys: string[]
): string | null => {
  const value = pickStringField(fields, keys, "");
  return value ? value : null;
};

const firstLinkedRecordId = (value: unknown): string | null => {
  if (!Array.isArray(value)) return null;
  const found = value.find((item) => typeof item === "string" && item.trim());
  return typeof found === "string" ? found.trim() : null;
};

const firstNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.trim().replace(",", ".");
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const parseAttachments = (value: unknown): AbonoComprobanteAdjunto[] => {
  if (!Array.isArray(value)) return [];
  const attachments: AbonoComprobanteAdjunto[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as {
      id?: unknown;
      url?: unknown;
      filename?: unknown;
      type?: unknown;
      size?: unknown;
      thumbnails?: unknown;
    };
    const maybeUrl = typeof row.url === "string" ? row.url.trim() : "";
    if (!maybeUrl) continue;
    const thumbnails = row.thumbnails as
      | {
          small?: { url?: string };
          large?: { url?: string };
          full?: { url?: string };
        }
      | undefined;
    const thumbnailUrl =
      thumbnails?.small?.url ?? thumbnails?.large?.url ?? thumbnails?.full?.url ?? null;
    attachments.push({
      id: typeof row.id === "string" ? row.id : null,
      url: maybeUrl,
      filename: typeof row.filename === "string" ? row.filename : null,
      contentType: typeof row.type === "string" ? row.type : null,
      size: typeof row.size === "number" && Number.isFinite(row.size) ? row.size : null,
      thumbnailUrl,
    });
  }
  return attachments;
};

const pickNumberField = (
  fields: Record<string, unknown>,
  keys: string[]
): number | null => {
  for (const key of keys) {
    const parsed = firstNumber(fields[key]);
    if (parsed !== null) return parsed;
  }
  return null;
};

const formatAirtableDateOnly = (date = new Date()): string =>
  date.toISOString().slice(0, 10);

const formatAirtableDateTimeISO = (date = new Date()): string =>
  date.toISOString();

// Lee el valor máximo del campo numérico en la tabla y devuelve max + 1.
// Se llama justo antes de insertar para minimizar la ventana de colisión.
const getNextConsecutivo = async (
  tableName: string,
  fieldName: string,
  client = getClient()
): Promise<number> => {
  const url = new URL(`${client.baseUrl}/${encodeURIComponent(tableName)}`);
  url.searchParams.set("pageSize", "1");
  url.searchParams.append("sort[0][field]", fieldName);
  url.searchParams.append("sort[0][direction]", "desc");
  url.searchParams.append("fields[]", fieldName);
  const res = await fetch(url.toString(), {
    headers: client.headers,
    cache: "no-store",
  });
  if (!res.ok) return 1;
  const data = (await res.json()) as { records?: AirtableGenericRecord[] };
  const max = data.records?.[0]?.fields?.[fieldName];
  return typeof max === "number" ? max + 1 : 1;
};

type AirtableGenericRecord = {
  id: string;
  fields: Record<string, unknown>;
  createdTime?: string;
};

const mapRepuestoPorOrdenRecord = (
  record: AirtableGenericRecord,
  ordenId: string
): RepuestoPorOrden => {
  const f = record.fields ?? {};
  const nombre = pickStringField(f, ["Nombre del repuesto snapshot o copiado"], "Repuesto");
  const cantidad = pickNumberField(f, ["Cantidad"]);
  const precioCliente = pickNumberField(f, ["Precio cliente real"]);
  const subtotalCliente = pickNumberField(f, ["Subtotal cliente"]);
  const costoProveedor = pickNumberField(f, ["Costo proveedor real"]);
  const proveedor = pickOptionalStringField(f, ["Proveedor real"]);
  const observacion = pickOptionalStringField(f, ["Observación"]);
  const fechaRegistro = pickOptionalStringField(f, ["Fecha de registro"]);

  return {
    id: record.id,
    ordenId,
    repuestoNombre: nombre,
    cantidad,
    precioCliente,
    subtotalCliente,
    costoProveedor,
    proveedor,
    observacion,
    fechaRegistro,
  };
};
const mapServicioPorOrdenRecord = (
  record: AirtableGenericRecord,
  ordenId: string
): ServicioPorOrden => {
  const f = record.fields ?? {};
  const nombre = pickStringField(f, ["Nombre del servicio snapshot o copiado"], "Servicio");
  const costo = pickNumberField(f, ["Costo real"]);
  const observacion = pickOptionalStringField(f, ["Observación"]);
  const fechaRegistro = pickOptionalStringField(f, ["Fecha de registro"]);

  return {
    id: record.id,
    ordenId,
    servicioNombre: nombre,
    costo,
    observacion,
    fechaRegistro,
  };
};

// Lee un registro de la tabla nueva "Abonos" (compartida con operaciones).
const mapAbonoRecord = (
  record: AirtableGenericRecord,
  ordenId: string
): AbonoPorOrden => {
  const f = record.fields ?? {};
  const comprobantes = parseAttachments(f["Comprobante"]);
  const idAbono = pickNumberField(f, ["ID Abono"]);
  return {
    id: record.id,
    idAbono: idAbono !== null ? String(idAbono) : null,
    ordenId,
    fecha: pickOptionalStringField(f, ["Fecha de Abono"]),
    monto: pickNumberField(f, ["Monto"]),
    metodoPago: pickOptionalStringField(f, ["M\u00e9todo de Pago"]),
    estado: pickStringField(f, ["Estado del Abono"], "Registrado"),
    numeroTransaccion: pickOptionalStringField(f, ["N\u00famero de Transacci\u00f3n"]),
    observacion: pickOptionalStringField(f, ["Observaci\u00f3n"]),
    registradoPor: pickOptionalStringField(f, ["Registrado Por"]),
    comprobante: comprobantes[0]?.url ?? pickOptionalStringField(f, ["Comprobante"]),
    comprobantes,
  };
};
const mapCatalogoRepuestoRecord = (record: AirtableGenericRecord): CatalogoRepuesto => {
  const f = record.fields ?? {};
  return {
    id: record.id,
    nombre: pickStringField(f, ["Nombre del repuesto"], "Repuesto sin nombre"),
    descripcionCorta: pickOptionalStringField(f, ["Descripción corta"]),
    skuCodigoInterno: pickOptionalStringField(f, ["SKU o código interno"]),
    proveedorHabitual: pickOptionalStringField(f, ["Proveedor habitual"]),
    costoBase: pickNumberField(f, ["Costo base"]),
    precioSugeridoCliente: pickNumberField(f, ["Precio sugerido al cliente"]),
    activo: f["Activo"] !== false,
    fechaCreacion: pickOptionalStringField(f, ["Fecha de creación", "Fecha de creacion"]),
  };
};
const mapCatalogoServicioRecord = (record: AirtableGenericRecord): CatalogoServicio => {
  const f = record.fields ?? {};
  return {
    id: record.id,
    nombre: pickStringField(f, ["Nombre del servicio"], "Servicio sin nombre"),
    descripcion: pickOptionalStringField(f, ["Descripción"]),
    costoSugerido: pickNumberField(f, ["Costo sugerido"]),
    activo: f["Activo"] !== false,
    fechaCreacion: pickOptionalStringField(f, ["Fecha de creación", "Fecha de creacion"]),
  };
};

const AIRTABLE_MAX_PAGE_SIZE = 100;

const clampAirtablePageSize = (value: number): number => {
  if (!Number.isFinite(value)) return AIRTABLE_MAX_PAGE_SIZE;
  return Math.max(1, Math.min(AIRTABLE_MAX_PAGE_SIZE, Math.floor(value)));
};

const escapeAirtableFormulaString = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const escapeRegexLiteral = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildTextSearchFormula = (query: string, fields: string[]): string | null => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return null;
  const escaped = escapeAirtableFormulaString(escapeRegexLiteral(normalized));
  return `OR(${fields
    .map((field) => `REGEX_MATCH(LOWER({${field}} & ""), "${escaped}")`)
    .join(",")})`;
};

const buildOrdenesFilterFormula = ({
  q,
  estado,
  risk,
}: {
  q?: string | null;
  estado?: string | null;
  risk?: OrdenesRiskFilter | null;
}): string | null => {
  const clauses: string[] = [];
  const searchFormula = buildTextSearchFormula(q ?? "", [
    "ID",
    "ClienteTXT",
    "Cliente",
    "Equipo",
    "Ingresa Por",
    "Telefono",
  ]);
  if (searchFormula) clauses.push(searchFormula);

  const normalizedEstado = (estado ?? "").trim();
  if (normalizedEstado && normalizedEstado.toLowerCase() !== "todos") {
    clauses.push(
      `LOWER({Estado Actual} & "") = "${escapeAirtableFormulaString(
        normalizedEstado.toLowerCase()
      )}"`
    );
  }

  const riskFormula = buildOrdenesRiskFormula(risk ?? null);
  if (riskFormula) clauses.push(riskFormula);

  if (clauses.length === 0) return null;
  if (clauses.length === 1) return clauses[0];
  return `AND(${clauses.join(",")})`;
};

const buildOrdenesRiskFormula = (risk?: OrdenesRiskFilter | null): string | null => {
  if (!risk) return null;

  const daysWaiting = `IF({Fecha de Ingreso}, DATETIME_DIFF(TODAY(), {Fecha de Ingreso}, 'days'), -1)`;
  const base = [
    `LOWER({Estado Actual} & "") = "esperando respuesta"`,
    `NOT({Fecha de Ingreso} = "")`,
  ];

  if (risk === "warning") {
    return `AND(${[...base, `${daysWaiting} >= 60`, `${daysWaiting} < 90`].join(",")})`;
  }

  return `AND(${[...base, `${daysWaiting} >= 90`].join(",")})`;
};

const isUnknownAirtableFieldError = (message: string): boolean =>
  message.includes("UNKNOWN_FIELD_NAME") || message.includes("Unknown field name");

const mapClienteRecord = (record: {
  id: string;
  fields?: Record<string, unknown>;
}): ClienteBusqueda => {
  const f = record.fields ?? {};
  return {
    id: record.id,
    nombre: pickStringField(f, ["Nombre"], "Cliente sin nombre"),
    cedula: pickStringField(f, ["C\u00e9dula", "Cedula"], ""),
    tipoIdentificacion: codigoDesdeAirtable(
      pickStringField(f, ["Cliente - Tipo Identificaci\u00f3n"], "")
    ) ?? "",
    telefono: pickStringField(f, ["Tel\u00e9fono", "Telefono"], ""),
    correo: pickStringField(f, ["Correo"], ""),
    direccion: pickStringField(f, ["Direcci\u00f3n", "Direccion"], ""),
    notas: pickOptionalStringField(f, ["Notas"]),
  };
};

const mapClienteListadoRecord = (record: {
  id: string;
  fields?: Record<string, unknown>;
}): ClienteListado => {
  const f = record.fields ?? {};
  return {
    ...mapClienteRecord(record),
    numeroOrdenes: pickNumberField(f, [
      "N\u00famero de \u00d3rdenes",
      "Numero de Ordenes",
      "N\u00famero de Ordenes",
      "Numero de \u00d3rdenes",
    ]),
    ultimaFechaIngreso:
      pickOptionalStringField(f, [
        "\u00daltima Fecha de Ingreso",
        "Ultima Fecha de Ingreso",
      ]) ?? "",
  };
};

const mapClienteDetalleRecord = (record: {
  id: string;
  fields?: Record<string, unknown>;
}): ClienteDetalle => {
  const f = record.fields ?? {};
  return {
    ...mapClienteListadoRecord(record),
    notas: pickOptionalStringField(f, ["Notas"]),
    ordenesRelacionadas: toLinkedRecordIds(f["\u00d3rdenes Relacionadas"]),
  };
};

const mapOrdenClienteRecord = (record: {
  id: string;
  fields?: Record<string, unknown>;
}): OrdenClienteListado => {
  const f = record.fields ?? {};
  return {
    recordId: record.id,
    idVisible: safeString(f["ID"], record.id),
    equipo: safeString(f["Equipo"], "Sin equipo"),
    fechaIngreso: safeString(f["Fecha de Ingreso"], ""),
    estadoActual: firstString(f["Estado Actual"], "Sin estado"),
  };
};

const buildClientesSearchFormula = (query: string, fields: string[]): string | null =>
  buildTextSearchFormula(query, fields);

const toLinkedRecordIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
};

const compareByFechaRegistroAsc = (
  a: AirtableGenericRecord,
  b: AirtableGenericRecord
): number => {
  const fechaA = pickOptionalStringField(a.fields ?? {}, ["Fecha de registro"]) ?? a.createdTime ?? "";
  const fechaB = pickOptionalStringField(b.fields ?? {}, ["Fecha de registro"]) ?? b.createdTime ?? "";
  return fechaA.localeCompare(fechaB);
};

const compareByFechaDesc = (a: AirtableGenericRecord, b: AirtableGenericRecord): number => {
  const fechaA = pickOptionalStringField(a.fields ?? {}, ["Fecha"]) ?? a.createdTime ?? "";
  const fechaB = pickOptionalStringField(b.fields ?? {}, ["Fecha"]) ?? b.createdTime ?? "";
  return fechaB.localeCompare(fechaA);
};

const fetchAllTableRecords = async ({
  tableName,
  client,
  limit,
}: {
  tableName: string;
  client: AirtableClient;
  limit?: number;
}): Promise<AirtableGenericRecord[]> => {
  const records: AirtableGenericRecord[] = [];
  let offset: string | undefined;
  const normalizedLimit =
    typeof limit === "number" && Number.isFinite(limit) && limit > 0
      ? Math.floor(limit)
      : null;

  do {
    const remaining = normalizedLimit === null ? AIRTABLE_MAX_PAGE_SIZE : normalizedLimit - records.length;
    if (remaining <= 0) break;

    const pageSize = clampAirtablePageSize(remaining);
    const url = new URL(`${client.baseUrl}/${encodeURIComponent(tableName)}`);
    url.searchParams.set("pageSize", String(pageSize));
    if (offset) {
      url.searchParams.set("offset", offset);
    }

    const res = await fetch(url.toString(), {
      headers: client.headers,
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Airtable error ${res.status}: ${text}`);
    }

    const payload = (await res.json()) as {
      records?: AirtableGenericRecord[];
      offset?: string;
    };
    records.push(...(payload.records ?? []));
    offset = payload.offset;
  } while (offset);

  return normalizedLimit === null ? records : records.slice(0, normalizedLimit);
};

const mapOrdenListadoRecord = (record: {
  id: string;
  fields?: Record<string, unknown>;
}): OrdenListado => {
  const f = record.fields ?? {};
  let clienteNombre = firstString(f["ClienteTXT"], "");
  if (clienteNombre.startsWith("rec")) clienteNombre = "";
  if (!clienteNombre) {
    const cli = firstString(f["Cliente"], "");
    clienteNombre = cli && !cli.startsWith("rec") ? cli : "";
  }
  if (!clienteNombre) clienteNombre = "Cliente no disponible";
  const ingresaPor = safeString(f["Ingresa Por"], "No disponible");

  return {
    recordId: record.id,
    idVisible: safeString(f["ID"], record.id),
    clienteNombre,
    telefono: safeString(f["Telefono"], "-"),
    equipo: safeString(f["Equipo"], "Sin equipo"),
    ingresaPor,
    estadoActual: firstString(f["Estado Actual"], "Sin estado"),
    fechaIngreso: safeString(f["Fecha de Ingreso"], ""),
    ultimaModificacion: pickStringField(
      f,
      ["Ultima Modificacion", "\u00daltima Modificacion", "\u00daltima Modificaci\u00f3n"],
      ""
    ),
  };
};

const countOrdenesByFormula = async ({
  q,
  estado,
  risk,
  client,
}: {
  q?: string | null;
  estado?: string | null;
  risk: OrdenesRiskFilter;
  client: AirtableClient;
}): Promise<number> => {
  let count = 0;
  let offset: string | undefined;
  const filterFormula = buildOrdenesFilterFormula({ q, estado, risk });

  do {
    const url = new URL(`${client.baseUrl}/${encodeURIComponent(AIRTABLE_TABLES.ordenes)}`);
    url.searchParams.set("pageSize", "100");
    url.searchParams.append("fields[]", "ID");
    if (filterFormula) {
      url.searchParams.append("filterByFormula", filterFormula);
    }
    if (offset) {
      url.searchParams.set("offset", offset);
    }

    const res = await fetch(url.toString(), {
      headers: client.headers,
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Airtable error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as {
      records?: AirtableGenericRecord[];
      offset?: string;
    };
    count += data.records?.length ?? 0;
    offset = data.offset;
  } while (offset);

  return count;
};

const fetchOrdenesRiskSummary = async ({
  q,
  estado,
  client,
}: {
  q?: string | null;
  estado?: string | null;
  client: AirtableClient;
}): Promise<OrdenesRiskSummary> => {
  const [warningCount, criticalCount] = await Promise.all([
    countOrdenesByFormula({ q, estado, risk: "warning", client }),
    countOrdenesByFormula({ q, estado, risk: "critical", client }),
  ]);

  return { warningCount, criticalCount };
};

const createEmptyOrdenesStatusCounts = (): OrdenesStatusCounts =>
  ESTADOS_ORDEN.reduce(
    (acc, estado) => {
      acc[estado] = 0;
      return acc;
    },
    {} as OrdenesStatusCounts
  );

const normalizeOrdenStatus = (value: unknown): EstadoOrden | null => {
  const raw = firstString(value, "").trim().toLowerCase();
  if (!raw) return null;

  return (
    ESTADOS_ORDEN.find((estado) => estado.toLowerCase() === raw) ?? null
  );
};

const fetchOrdenesStatusCounts = async ({
  q,
  risk,
  client,
}: {
  q?: string | null;
  risk?: OrdenesRiskFilter | null;
  client: AirtableClient;
}): Promise<OrdenesStatusCounts> => {
  const counts = createEmptyOrdenesStatusCounts();
  const filterFormula = buildOrdenesFilterFormula({ q, estado: null, risk });
  let offset: string | undefined;

  do {
    const url = new URL(`${client.baseUrl}/${encodeURIComponent(AIRTABLE_TABLES.ordenes)}`);
    url.searchParams.set("pageSize", "100");
    url.searchParams.append("fields[]", "Estado Actual");
    if (filterFormula) {
      url.searchParams.append("filterByFormula", filterFormula);
    }
    if (offset) {
      url.searchParams.set("offset", offset);
    }

    const res = await fetch(url.toString(), {
      headers: client.headers,
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Airtable error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as {
      records?: AirtableGenericRecord[];
      offset?: string;
    };

    for (const record of data.records ?? []) {
      const status = normalizeOrdenStatus(record.fields?.["Estado Actual"]);
      if (status) counts[status] += 1;
    }

    offset = data.offset;
  } while (offset);

  return counts;
};

// --- Listado de Ã³rdenes ---
export const fetchOrdenesPage = async ({
  pageSize = 30,
  offset,
  q,
  estado,
  risk,
}: FetchOrdenesPageOptions = {}): Promise<OrdenesPageResult> => {
  const client = getClient();
  const normalizedPageSize = clampAirtablePageSize(pageSize);
  const url = new URL(
    `${client.baseUrl}/${encodeURIComponent(AIRTABLE_TABLES.ordenes)}`
  );

  url.searchParams.set("pageSize", String(normalizedPageSize));
  if (offset) {
    url.searchParams.set("offset", offset);
  }
  url.searchParams.append("sort[0][field]", "Fecha de Ingreso");
  url.searchParams.append("sort[0][direction]", "desc");
  const filterFormula = buildOrdenesFilterFormula({ q, estado, risk });
  if (filterFormula) {
    url.searchParams.append("filterByFormula", filterFormula);
  }
  [
    "ID",
    "ClienteTXT",
    "Cliente",
    "Telefono",
    "Fecha de Ingreso",
    "Equipo",
    "Ingresa Por",
    "Estado Actual",
  ].forEach(
    (field) => url.searchParams.append("fields[]", field)
  );

  const res = await fetch(url.toString(), {
    headers: client.headers,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable error ${res.status}: ${text}`);
  }

  type AirtableRow = { id: string; fields: Record<string, unknown> };
  const data = (await res.json()) as { records?: AirtableRow[]; offset?: string };
  const records = data.records ?? [];

  const [riskSummary, statusCounts] = await Promise.all([
    fetchOrdenesRiskSummary({ q, estado, client }),
    fetchOrdenesStatusCounts({ q, risk, client }),
  ]);

  return {
    records: records.map(mapOrdenListadoRecord),
    nextOffset: data.offset ?? null,
    pageSize: normalizedPageSize,
    hasNext: Boolean(data.offset),
    riskSummary,
    statusCounts,
  };
};

export const fetchOrdenes = async (limit = 30): Promise<OrdenListado[]> => {
  const result = await fetchOrdenesPage({ pageSize: limit });
  return result.records;
};

export const fetchClientesPage = async ({
  pageSize = 30,
  offset,
  q,
}: FetchClientesPageOptions = {}): Promise<ClientesPageResult> => {
  const client = getClient();
  const normalizedPageSize = clampAirtablePageSize(pageSize);
  const query = (q ?? "").trim();
  const fieldSets = [
    [
      "Nombre",
      "C\u00e9dula",
      "Tel\u00e9fono",
      "Correo",
      "Direcci\u00f3n",
      "N\u00famero de \u00d3rdenes",
      "\u00daltima Fecha de Ingreso",
    ],
    [
      "Nombre",
      "Cedula",
      "Telefono",
      "Correo",
      "Direccion",
      "Numero de Ordenes",
      "Ultima Fecha de Ingreso",
    ],
  ];
  let lastError: Error | null = null;

  for (const fields of fieldSets) {
    const url = new URL(`${client.baseUrl}/${encodeURIComponent(AIRTABLE_TABLES.clientes)}`);
    url.searchParams.set("pageSize", String(normalizedPageSize));
    if (offset) {
      url.searchParams.set("offset", offset);
    }
    url.searchParams.append("sort[0][field]", "Nombre");
    url.searchParams.append("sort[0][direction]", "asc");

    const formula = buildClientesSearchFormula(query, fields.slice(0, 4));
    if (formula) {
      url.searchParams.append("filterByFormula", formula);
    }
    fields.forEach((field) => url.searchParams.append("fields[]", field));

    const res = await fetch(url.toString(), {
      headers: client.headers,
      cache: "no-store",
    });

    if (res.ok) {
      const data = (await res.json()) as {
        records?: AirtableGenericRecord[];
        offset?: string;
      };
      return {
        records: (data.records ?? []).map(mapClienteListadoRecord),
        nextOffset: data.offset ?? null,
        pageSize: normalizedPageSize,
        hasNext: Boolean(data.offset),
      };
    }

    const text = await res.text();
    const error = new Error(`Airtable error ${res.status}: ${text}`);
    lastError = error;
    if (!isUnknownAirtableFieldError(error.message)) {
      throw error;
    }
  }

  throw lastError ?? new Error("No se pudieron cargar los clientes");
};

export const buscarClientes = async ({
  q,
  pageSize = 8,
}: {
  q: string;
  pageSize?: number;
}): Promise<ClienteBusqueda[]> => {
  const client = getClient();
  const query = q.trim();
  if (query.length < 2) return [];

  const fieldSets = [
    ["Nombre", "C\u00e9dula", "Tel\u00e9fono"],
    ["Nombre", "Cedula", "Telefono"],
  ];
  let lastError: Error | null = null;

  for (const fields of fieldSets) {
    const url = new URL(`${client.baseUrl}/${encodeURIComponent(AIRTABLE_TABLES.clientes)}`);
    url.searchParams.set("pageSize", String(clampAirtablePageSize(pageSize)));
    const formula = buildClientesSearchFormula(query, fields);
    if (formula) {
      url.searchParams.append("filterByFormula", formula);
    }

    const res = await fetch(url.toString(), {
      headers: client.headers,
      cache: "no-store",
    });

    if (res.ok) {
      const data = (await res.json()) as { records?: AirtableGenericRecord[] };
      return (data.records ?? []).map(mapClienteRecord);
    }

    const text = await res.text();
    const error = new Error(`Airtable error ${res.status}: ${text}`);
    lastError = error;
    if (!isUnknownAirtableFieldError(error.message)) {
      throw error;
    }
  }

  throw lastError ?? new Error("No se pudieron buscar clientes");
};

export const buscarClienteDuplicado = async ({
  cedula,
  telefono,
}: BuscarClienteDuplicadoInput): Promise<ClienteBusqueda | null> => {
  const normalizedCedula = cedula?.trim().toLowerCase() ?? "";
  const normalizedTelefono = telefono?.trim().toLowerCase() ?? "";
  if (!normalizedCedula && !normalizedTelefono) return null;

  const client = getClient();
  const fieldSets = [
    ["C\u00e9dula", "Tel\u00e9fono"],
    ["Cedula", "Telefono"],
  ];
  let lastError: Error | null = null;

  for (const [cedulaField, telefonoField] of fieldSets) {
    const clauses: string[] = [];
    if (normalizedCedula) {
      clauses.push(`LOWER({${cedulaField}} & "") = "${escapeAirtableFormulaString(normalizedCedula)}"`);
    }
    if (normalizedTelefono) {
      clauses.push(`LOWER({${telefonoField}} & "") = "${escapeAirtableFormulaString(normalizedTelefono)}"`);
    }

    const url = new URL(`${client.baseUrl}/${encodeURIComponent(AIRTABLE_TABLES.clientes)}`);
    url.searchParams.set("pageSize", "1");
    url.searchParams.append("filterByFormula", clauses.length === 1 ? clauses[0] : `OR(${clauses.join(",")})`);

    const res = await fetch(url.toString(), {
      headers: client.headers,
      cache: "no-store",
    });

    if (res.ok) {
      const data = (await res.json()) as { records?: AirtableGenericRecord[] };
      const record = data.records?.[0];
      return record ? mapClienteRecord(record) : null;
    }

    const text = await res.text();
    const error = new Error(`Airtable error ${res.status}: ${text}`);
    lastError = error;
    if (!isUnknownAirtableFieldError(error.message)) {
      throw error;
    }
  }

  throw lastError ?? new Error("No se pudo validar duplicados de clientes");
};

export const createCliente = async (input: NuevoClienteInput): Promise<ClienteBusqueda> => {
  const nombre = input.nombre.trim();
  if (!nombre) {
    throw new Error("El nombre del cliente es obligatorio");
  }

  if (input.cedula?.trim()) {
    await assertCedulaDisponible(input.cedula);
  }

  const fechaRegistro = formatAirtableDateOnly();
  const fieldVariants: Record<string, unknown>[] = [
    {
      Nombre: nombre,
      "C\u00e9dula": input.cedula?.trim() || undefined,
      "Cliente - Tipo Identificaci\u00f3n": etiquetaAirtable(input.tipoIdentificacion ?? "") || undefined,
      "Tel\u00e9fono": input.telefono?.trim() || undefined,
      Correo: input.correo?.trim() || undefined,
      "Direcci\u00f3n": input.direccion?.trim() || undefined,
      Notas: input.notas?.trim() || undefined,
      "Fecha de registro": fechaRegistro,
    },
    {
      Nombre: nombre,
      Cedula: input.cedula?.trim() || undefined,
      "Cliente - Tipo Identificaci\u00f3n": etiquetaAirtable(input.tipoIdentificacion ?? "") || undefined,
      Telefono: input.telefono?.trim() || undefined,
      Correo: input.correo?.trim() || undefined,
      Direccion: input.direccion?.trim() || undefined,
      Notas: input.notas?.trim() || undefined,
      "Fecha de registro": fechaRegistro,
    },
  ].map((fields) =>
    Object.fromEntries(
      Object.entries(fields).filter(([, value]) => value !== undefined && value !== "")
    )
  );

  let lastError: Error | null = null;
  for (const fields of fieldVariants) {
    try {
      const created = await createRecord(AIRTABLE_TABLES.clientes, fields);
      return mapClienteRecord(created);
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Error inesperado");
      lastError = err;
      if (!isUnknownAirtableFieldError(err.message)) {
        throw err;
      }
    }
  }

  throw lastError ?? new Error("No se pudo crear el cliente");
};

export const fetchClienteById = async (recordId: string): Promise<ClienteDetalle | null> => {
  const id = recordId.trim();
  if (!id) return null;

  try {
    const record = await fetchRecordById(AIRTABLE_TABLES.clientes, id);
    return mapClienteDetalleRecord(record);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Airtable error 404")) return null;
    throw error;
  }
};

const fetchOrdenesByIds = async (
  recordIds: string[],
  client = getClient()
): Promise<OrdenClienteListado[]> => {
  const ids = [...new Set(recordIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return [];

  const allRecords: AirtableGenericRecord[] = [];
  for (let index = 0; index < ids.length; index += 50) {
    const chunk = ids.slice(index, index + 50);
    const url = new URL(`${client.baseUrl}/${encodeURIComponent(AIRTABLE_TABLES.ordenes)}`);
    url.searchParams.set("pageSize", "100");
    url.searchParams.append(
      "filterByFormula",
      `OR(${chunk
        .map((id) => `RECORD_ID()="${escapeAirtableFormulaString(id)}"`)
        .join(",")})`
    );
    url.searchParams.append("sort[0][field]", "Fecha de Ingreso");
    url.searchParams.append("sort[0][direction]", "desc");
    ["ID", "Equipo", "Fecha de Ingreso", "Estado Actual"].forEach((field) =>
      url.searchParams.append("fields[]", field)
    );

    const res = await fetch(url.toString(), {
      headers: client.headers,
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Airtable error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as { records?: AirtableGenericRecord[] };
    allRecords.push(...(data.records ?? []));
  }

  return allRecords
    .map(mapOrdenClienteRecord)
    .sort((a, b) => (b.fechaIngreso || "").localeCompare(a.fechaIngreso || ""));
};

const fetchOrdenesByClienteFormula = async (
  clienteRecordId: string,
  client = getClient()
): Promise<OrdenClienteListado[]> => {
  const formulas = [
    `FIND("${escapeAirtableFormulaString(clienteRecordId)}", ARRAYJOIN({Cliente})) > 0`,
    `FIND("${escapeAirtableFormulaString(clienteRecordId)}", {Cliente} & "") > 0`,
  ];
  let lastError: Error | null = null;

  for (const formula of formulas) {
    const records: AirtableGenericRecord[] = [];
    let offset: string | undefined;
    try {
      do {
        const url = new URL(`${client.baseUrl}/${encodeURIComponent(AIRTABLE_TABLES.ordenes)}`);
        url.searchParams.set("pageSize", "100");
        url.searchParams.append("filterByFormula", formula);
        url.searchParams.append("sort[0][field]", "Fecha de Ingreso");
        url.searchParams.append("sort[0][direction]", "desc");
        ["ID", "Equipo", "Fecha de Ingreso", "Estado Actual"].forEach((field) =>
          url.searchParams.append("fields[]", field)
        );
        if (offset) {
          url.searchParams.set("offset", offset);
        }

        const res = await fetch(url.toString(), {
          headers: client.headers,
          cache: "no-store",
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Airtable error ${res.status}: ${text}`);
        }

        const data = (await res.json()) as {
          records?: AirtableGenericRecord[];
          offset?: string;
        };
        records.push(...(data.records ?? []));
        offset = data.offset;
      } while (offset);

      return records.map(mapOrdenClienteRecord);
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Error inesperado");
      lastError = err;
      if (!isUnknownAirtableFieldError(err.message)) {
        throw err;
      }
    }
  }

  throw lastError ?? new Error("No se pudieron cargar las órdenes del cliente");
};

export const fetchOrdenesByClienteId = async (
  clienteRecordId: string
): Promise<OrdenClienteListado[]> => {
  const cliente = await fetchClienteById(clienteRecordId);
  if (!cliente) {
    throw new Error("Cliente no encontrado");
  }

  if (cliente.ordenesRelacionadas.length > 0) {
    return fetchOrdenesByIds(cliente.ordenesRelacionadas);
  }

  return fetchOrdenesByClienteFormula(clienteRecordId);
};

export const updateClienteById = async (
  recordId: string,
  input: NuevoClienteInput
): Promise<ClienteDetalle> => {
  const id = recordId.trim();
  const nombre = input.nombre.trim();
  if (!id) {
    throw new Error("Falta el id del cliente");
  }
  if (!nombre) {
    throw new Error("El nombre del cliente es obligatorio");
  }

  if (input.cedula?.trim()) {
    await assertCedulaDisponible(input.cedula, id);
  }

  const fieldVariants: Record<string, unknown>[] = [
    {
      Nombre: nombre,
      "C\u00e9dula": input.cedula?.trim() ?? "",
      "Tel\u00e9fono": input.telefono?.trim() ?? "",
      Correo: input.correo?.trim() ?? "",
      "Direcci\u00f3n": input.direccion?.trim() ?? "",
      Notas: input.notas?.trim() ?? "",
    },
    {
      Nombre: nombre,
      Cedula: input.cedula?.trim() ?? "",
      Telefono: input.telefono?.trim() ?? "",
      Correo: input.correo?.trim() ?? "",
      Direccion: input.direccion?.trim() ?? "",
      Notas: input.notas?.trim() ?? "",
    },
  ];
  let lastError: Error | null = null;

  for (const fields of fieldVariants) {
    try {
      const updated = await patchRecordFields({
        tableName: AIRTABLE_TABLES.clientes,
        recordId: id,
        fields,
      });
      return mapClienteDetalleRecord(updated);
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Error inesperado");
      lastError = err;
      if (!isUnknownAirtableFieldError(err.message)) {
        throw err;
      }
    }
  }

  throw lastError ?? new Error("No se pudo actualizar el cliente");
};

export const deleteClienteById = async (
  recordId: string
): Promise<{ deleted: true }> => {
  const id = recordId.trim();
  if (!id) {
    throw new Error("Falta el id del cliente");
  }

  const cliente = await fetchClienteById(id);
  if (!cliente) {
    throw new Error("Cliente no encontrado");
  }

  const numeroOrdenes = cliente.numeroOrdenes ?? 0;
  if (numeroOrdenes > 0 || cliente.ordenesRelacionadas.length > 0) {
    throw new Error(
      "Este cliente tiene órdenes registradas. Para conservar el historial, no se puede eliminar."
    );
  }

  const ordenes = await fetchOrdenesByClienteFormula(id);
  if (ordenes.length > 0) {
    throw new Error(
      "Este cliente tiene órdenes registradas. Para conservar el historial, no se puede eliminar."
    );
  }

  await deleteRecordById({
    tableName: AIRTABLE_TABLES.clientes,
    recordId: id,
  });

  return { deleted: true };
};

export const createOrdenReparacion = async ({
  clienteId,
  nuevoCliente,
  orden,
}: NuevaOrdenInput): Promise<OrdenCreadaResult> => {
  const equipo = orden.equipo.trim();
  const ingresaPor = orden.ingresaPor.trim();
  if (!equipo) {
    throw new Error("El equipo es obligatorio");
  }
  if (!ingresaPor) {
    throw new Error("Ingresa Por es obligatorio");
  }

  let clienteRecordId = clienteId?.trim() || "";
  if (!clienteRecordId) {
    if (!nuevoCliente?.nombre?.trim()) {
      throw new Error("Selecciona un cliente o registra uno nuevo");
    }
    const createdCliente = await createCliente(nuevoCliente);
    clienteRecordId = createdCliente.id;
  }

  const client = getClient();
  const nextAutonumber = await getNextConsecutivo(
    AIRTABLE_TABLES.ordenes,
    "Autonumber",
    client
  );

  const fields: Record<string, unknown> = {
    Cliente: [clienteRecordId],
    Equipo: equipo,
    "Ingresa Por": ingresaPor,
    "Estado Actual": "Pendiente",
    "Tipo Orden": "Servicio de Reparaci\u00f3n",
    Autonumber: nextAutonumber,
    "Fecha de Ingreso": formatAirtableDateTimeISO(),
    // Fase 11: toda orden nueva nace en V2 (repuestos desde Shipping Items).
    "Modo repuestos": "V2",
  };

  const accesorios = orden.accesorios?.trim();
  if (accesorios) {
    fields.Accesorios = accesorios;
  }

  const createdOrden = await createRecord(AIRTABLE_TABLES.ordenes, fields, client);
  return {
    ok: true,
    ordenId: safeString(createdOrden.fields?.["ID"], createdOrden.id),
    airtableRecordId: createdOrden.id,
  };
};

// --- Detalle de orden principal ---
export const fetchOrdenById = async (recordId: string): Promise<OrdenDetalle | null> => {
  const client = getClient();
  const url = `${client.baseUrl}/${encodeURIComponent(
    AIRTABLE_TABLES.ordenes
  )}/${encodeURIComponent(recordId)}`;

  const res = await fetch(url, {
    headers: client.headers,
    cache: "no-store",
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable error ${res.status}: ${text}`);
  }

  const payload = (await res.json()) as { id: string; fields: Record<string, unknown> };
  const f = payload.fields ?? {};
  const ordenRecordId = payload.id;

  const clienteNombre = pickStringField(
    f,
    ["Cliente Nombre", "Nombre Cliente", "ClienteTXT", "Cliente"],
    "Cliente no disponible"
  );

  const clienteRaw = f["Cliente"];
  const clienteRecordId =
    Array.isArray(clienteRaw) &&
    clienteRaw.length > 0 &&
    typeof clienteRaw[0] === "string" &&
    (clienteRaw[0] as string).startsWith("rec")
      ? (clienteRaw[0] as string)
      : null;

  const tipoOrden = pickStringField(
    f,
    ["Tipo Orden", "Tipo de Orden"],
    "Tipo no disponible"
  );

  const baseDetail = {
    recordId: payload.id,
    idVisible: safeString(f["ID"], payload.id),
    estadoActual: firstString(f["Estado Actual"], "Sin estado"),
    fechaIngreso: safeString(f["Fecha de Ingreso"], ""),
    ultimaModificacion: pickStringField(
      f,
      ["Ultima Modificacion", "\u00daltima Modificacion", "\u00daltima Modificaci\u00f3n"],
      ""
    ),
    ingresaPor: safeString(f["Ingresa Por"], "No disponible"),
    tipoOrden,
    clienteNombre,
    clienteRecordId,
    cedula: pickStringField(f, ["CedulaTXT", "C\u00e9dulaTXT", "Cedula", "C\u00e9dula"], "-"),
    telefono: pickStringField(f, ["TelefonoTXT", "Telefono"], "-"),
    equipo: safeString(f["Equipo"], "No disponible"),
    accesorios: safeString(f["Accesorios"], "No disponible"),
    diagnosticoInicial: safeString(f["Diagnostico Inicial"], "No disponible"),
    notaInterna: pickStringField(
      f,
      ["Nota interna", "Nota Interna", "Observaciones internas", "Observaciones Internas"],
      "No disponible"
    ),
    recomendaciones: safeString(f["Recomendaciones"], "No disponible"),
    costoTotalServiciosNV: pickNumberField(f, ["Costo Total Servicios NV"]),
    costoTotalRepuestosNV: pickNumberField(f, ["Costo Total Repuestos NV"]),
    totalProductosDigitalesNV: pickNumberField(f, ["Total Productos Digitales"]),
    totalAPagarNV: pickNumberField(f, ["Total a Pagar NV"]),
    totalAbonadoNV: pickNumberField(f, ["Total Abonado NV"]),
    saldoNV: pickNumberField(f, ["Saldo NV"]),
    documentos: parseAttachments(f["Documentos"]),
    cotizacionId: pickStringField(f, ["Cotización ID", "Cotizacion ID"], ""),
    cotizacionCodigo: pickStringField(f, ["Cotización Código", "Cotizacion Codigo"], ""),
    proximoMantenimiento: safeString(f["Próximo Mantenimiento"], ""),
    mantenimientoNotificado: f["Mantenimiento Notificado"] === true,
  };

  // Historial: preferir IDs vinculados desde la orden
  const historialIdsRaw = f["Historial de Estados"];
  const historialIds =
    Array.isArray(historialIdsRaw) && historialIdsRaw.every((v) => typeof v === "string")
      ? (historialIdsRaw as string[])
      : [];

  const [historial, repuestosPorOrden, serviciosPorOrden, abonosPorOrden, productosDigitales] = await Promise.all([
    historialIds.length > 0
      ? fetchHistorialByIds(historialIds, client)
      : fetchHistorialByOrden(ordenRecordId, client),
    fetchRepuestosPorOrden(ordenRecordId, client),
    fetchServiciosPorOrden(ordenRecordId, client),
    fetchAbonosPorOrden(ordenRecordId, client),
    fetchProductosDigitalesPorOrden(ordenRecordId, client),
  ]);

  return {
    ...baseDetail,
    historial,
    repuestos: [],
    servicios: [],
    repuestosPorOrden,
    serviciosPorOrden,
    abonosPorOrden,
    productosDigitales,
  };
};

// --- Historial por IDs vinculados ---
export const fetchHistorialByIds = async (
  recordIds: string[],
  client = getClient()
): Promise<HistorialEstado[]> => {
  if (recordIds.length === 0) return [];

  const url = new URL(
    `${client.baseUrl}/${encodeURIComponent(AIRTABLE_TABLES.historial)}`
  );
  const formula = `OR(${recordIds
    .map((id) => `RECORD_ID()="${id}"`)
    .join(",")})`;
  url.searchParams.append("filterByFormula", formula);
  url.searchParams.append("sort[0][field]", "Fecha");
  url.searchParams.append("sort[0][direction]", "desc");

  const res = await fetch(url.toString(), {
    headers: client.headers,
    cache: "no-store",
  });
  if (!res.ok) return [];

  type AirtableRow = { id: string; fields: Record<string, unknown> };
  const data = (await res.json()) as { records?: AirtableRow[] };
  const records = data.records ?? [];

  return records.map((r) => {
    const f = r.fields ?? {};
    const tecnicoNombreRaw = firstString(f["Tecnico Nombre"], "");
    const tecnicoIdRaw = firstString(f["Tecnico"], "");
    const tecnicoNombre = tecnicoNombreRaw || null;
    const tecnicoId = tecnicoIdRaw || null;
    const notaRaw = safeString(f["Estado Nuevo"], "");
    return {
      id: safeString(f["ID"], r.id),
      ordenId: "", // no viene en esta consulta; opcional
      estadoNuevo: safeString(f["Estado Nuevo"], "Sin estado") as EstadoOrden,
      fecha: safeString(f["Fecha"], ""),
      tecnicoId,
      tecnicoNombre,
      nota: notaRaw || null,
      creadoDesdeAppTecnico: Boolean(f["Creado desde App TÃ©cnico"]),
      estadoGeneradoIA: safeString(f["Estado Generado IA"], "") || null,
      solicitarMensajeCliente: Boolean(f["Solicitar Mensaje Cliente"]),
    };
  }).reverse(); // Ascendente: mas antiguo primero
};

// --- Historial ---
export const fetchHistorialByOrden = async (
  recordId: string,
  client = getClient()
): Promise<HistorialEstado[]> => {
  const url = new URL(
    `${client.baseUrl}/${encodeURIComponent(AIRTABLE_TABLES.historial)}`
  );
  url.searchParams.set("pageSize", "50");
  url.searchParams.append("sort[0][field]", "Fecha");
  url.searchParams.append("sort[0][direction]", "desc");
  url.searchParams.append(
    "filterByFormula",
    `OR(
      FIND("${recordId}", ARRAYJOIN({Ã“rdenes de ReparaciÃ³n}))=1,
      FIND("${recordId}", ARRAYJOIN({Orden}))=1
    )`
  );

  const res = await fetch(url.toString(), {
    headers: client.headers,
    cache: "no-store",
  });
  if (!res.ok) return [];

  type AirtableRow = { id: string; fields: Record<string, unknown> };
  const data = (await res.json()) as { records?: AirtableRow[] };
  const records = data.records ?? [];

  return records.map((r) => {
    const f = r.fields ?? {};
    const tecnicoNombreRaw = firstString(f["Tecnico Nombre"], "");
    const tecnicoIdRaw = firstString(f["Tecnico"], "");
    const tecnicoNombre = tecnicoNombreRaw || null;
    const tecnicoId = tecnicoIdRaw || null;
    const notaRaw = safeString(f["Estado Nuevo"], "");
    return {
      id: safeString(f["ID"], r.id),
      ordenId: recordId,
      estadoNuevo: safeString(f["Estado Nuevo"], "Sin estado") as EstadoOrden,
      fecha: safeString(f["Fecha"], ""),
      tecnicoId,
      tecnicoNombre,
      nota: notaRaw || null,
      creadoDesdeAppTecnico: Boolean(f["Creado desde App TÃ©cnico"]),
      estadoGeneradoIA: safeString(f["Estado Generado IA"], "") || null,
      solicitarMensajeCliente: Boolean(f["Solicitar Mensaje Cliente"]),
    };
  }).reverse(); // Ascendente: mas antiguo primero
};

// --- Repuestos ---
export const fetchRepuestosByOrden = async (
  recordId: string,
  client = getClient()
): Promise<RepuestoUsado[]> => {
  const url = new URL(
    `${client.baseUrl}/${encodeURIComponent(AIRTABLE_TABLES.repuestos)}`
  );
  url.searchParams.set("pageSize", "50");
  url.searchParams.append("sort[0][field]", "Fecha de Uso");
  url.searchParams.append("sort[0][direction]", "desc");
  url.searchParams.append(
    "filterByFormula",
    `SEARCH("${recordId}", ARRAYJOIN({Orden de Reparación}))`
  );

  const res = await fetch(url.toString(), {
    headers: client.headers,
    cache: "no-store",
  });
  if (!res.ok) return [];

  type AirtableRow = { id: string; fields: Record<string, unknown> };
  const data = (await res.json()) as { records?: AirtableRow[] };
  const records = data.records ?? [];

  return records.map((r) => {
    const f = r.fields ?? {};
    return {
      id: safeString(f["ID"], r.id),
      ordenId: recordId,
      repuesto: safeString(f["Repuesto"], "No disponible"),
      precioCliente: typeof f["Precio Cliente"] === "number" ? (f["Precio Cliente"] as number) : null,
      costoProveedor: typeof f["Costo Proveedor"] === "number" ? (f["Costo Proveedor"] as number) : null,
      proveedor: safeString(f["Proveedor"], "No disponible"),
      fechaUso: safeString(f["Fecha de Uso"], ""),
    };
  });
};

// --- Servicios ---
export const fetchServiciosByOrden = async (
  recordId: string,
  client = getClient()
): Promise<ServicioOrden[]> => {
  const url = new URL(
    `${client.baseUrl}/${encodeURIComponent(AIRTABLE_TABLES.servicios)}`
  );
  url.searchParams.set("pageSize", "50");
  url.searchParams.append("sort[0][field]", "Creado");
  url.searchParams.append("sort[0][direction]", "desc");
  url.searchParams.append(
    "filterByFormula",
    `SEARCH("${recordId}", ARRAYJOIN({Orden de Reparación}))`
  );

  const res = await fetch(url.toString(), {
    headers: client.headers,
    cache: "no-store",
  });
  if (!res.ok) return [];

  type AirtableRow = { id: string; fields: Record<string, unknown> };
  const data = (await res.json()) as { records?: AirtableRow[] };
  const records = data.records ?? [];

  return records.map((r) => {
    const f = r.fields ?? {};
    return {
      id: safeString(f["ID"], r.id),
      ordenId: recordId,
      servicio: safeString(f["Servicio"], "No disponible"),
      costo: typeof f["Costo"] === "number" ? (f["Costo"] as number) : null,
    };
  });
};

// --- Nuevas tablas: Repuestos por Orden ---
export const fetchRepuestosPorOrden = async (
  recordId: string,
  client = getClient()
): Promise<RepuestoPorOrden[]> => {
  const records = await fetchAllTableRecords({
    tableName: AIRTABLE_TABLES.repuestosPorOrden,
    client,
  });

  const filtrados = records
    .filter((record) => toLinkedRecordIds(record.fields?.["Orden de Reparación"]).includes(recordId))
    .sort(compareByFechaRegistroAsc);

  return filtrados.map((record) => mapRepuestoPorOrdenRecord(record, recordId));
};

// --- Nuevas tablas: Servicios por Orden ---
export const fetchServiciosPorOrden = async (
  recordId: string,
  client = getClient()
): Promise<ServicioPorOrden[]> => {
  const records = await fetchAllTableRecords({
    tableName: AIRTABLE_TABLES.serviciosPorOrden,
    client,
  });

  const filtrados = records
    .filter((record) => toLinkedRecordIds(record.fields?.["Orden de Reparación"]).includes(recordId))
    .sort(compareByFechaRegistroAsc);

  return filtrados.map((record) => mapServicioPorOrdenRecord(record, recordId));
};

// Trae registros por RECORD_ID() \u2014 nunca filtrar por campo de link directamente
// (Airtable no soporta {multipleRecordLinks field} = 'recXXX' de forma confiable).
const fetchRecordsByIds = async (
  tableName: string,
  ids: string[],
  client = getClient()
): Promise<AirtableGenericRecord[]> => {
  if (ids.length === 0) return [];
  const url = new URL(`${client.baseUrl}/${encodeURIComponent(tableName)}`);
  const formula =
    ids.length === 1
      ? `RECORD_ID()='${ids[0]}'`
      : `OR(${ids.map((rid) => `RECORD_ID()='${rid}'`).join(",")})`;
  url.searchParams.set("filterByFormula", formula);
  url.searchParams.set("pageSize", "100");
  const res = await fetch(url.toString(), { headers: client.headers, cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as { records?: AirtableGenericRecord[] };
  return data.records ?? [];
};

const compareByFechaAbonoDesc = (a: AirtableGenericRecord, b: AirtableGenericRecord): number => {
  const fechaA = pickOptionalStringField(a.fields ?? {}, ["Fecha de Abono"]) ?? a.createdTime ?? "";
  const fechaB = pickOptionalStringField(b.fields ?? {}, ["Fecha de Abono"]) ?? b.createdTime ?? "";
  return fechaB.localeCompare(fechaA);
};

// --- Tabla: Abonos (nueva, compartida con operaciones) ---
export const fetchAbonosPorOrden = async (
  recordId: string,
  client = getClient()
): Promise<AbonoPorOrden[]> => {
  const ordenRecord = await fetchRecordById(AIRTABLE_TABLES.ordenes, recordId, client);
  // "Abonos (Operaci\u00f3n)" es el inverso de Abonos."Aplicado a: Orden"
  const abonoIds = toLinkedRecordIds(ordenRecord.fields?.["Abonos (Operaci\u00f3n)"]);
  if (abonoIds.length === 0) return [];

  const records = await fetchRecordsByIds(AIRTABLE_TABLES.abonos, abonoIds, client);
  return records
    .sort(compareByFechaAbonoDesc)
    .map((record) => mapAbonoRecord(record, recordId));
};

export const fetchCatalogoRepuestos = async (
  client = getClient(),
  limit?: number
): Promise<CatalogoRepuesto[]> => {
  return fetchCatalogoRepuestosGestion({ client, limit, activo: "activos" });
};

export const fetchCatalogoRepuestosGestion = async ({
  client = getClient(),
  limit,
  activo = "todos",
}: {
  client?: AirtableClient;
  limit?: number;
  activo?: "todos" | "activos" | "inactivos";
} = {}): Promise<CatalogoRepuesto[]> => {
  const records = await fetchAllTableRecords({
    tableName: AIRTABLE_TABLES.catalogoRepuestos,
    client,
    limit,
  });

  return records
    .map((record) => mapCatalogoRepuestoRecord(record))
    .filter((item) => {
      if (activo === "activos") return item.activo;
      if (activo === "inactivos") return !item.activo;
      return true;
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
};

export const fetchCatalogoServicios = async (
  client = getClient(),
  limit?: number
): Promise<CatalogoServicio[]> => {
  return fetchCatalogoServiciosGestion({ client, limit, activo: "activos" });
};

export const fetchCatalogoServiciosGestion = async ({
  client = getClient(),
  limit,
  activo = "todos",
}: {
  client?: AirtableClient;
  limit?: number;
  activo?: "todos" | "activos" | "inactivos";
} = {}): Promise<CatalogoServicio[]> => {
  const records = await fetchAllTableRecords({
    tableName: AIRTABLE_TABLES.catalogoServicios,
    client,
    limit,
  });

  return records
    .map((record) => mapCatalogoServicioRecord(record))
    .filter((item) => {
      if (activo === "activos") return item.activo;
      if (activo === "inactivos") return !item.activo;
      return true;
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
};

const createRecord = async (
  tableName: string,
  fields: Record<string, unknown>,
  client = getClient()
): Promise<AirtableGenericRecord> => {
  const url = `${client.baseUrl}/${encodeURIComponent(tableName)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: client.headers,
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable error ${res.status}: ${text}`);
  }
  return (await res.json()) as AirtableGenericRecord;
};

const fetchRecordById = async (
  tableName: string,
  recordId: string,
  client = getClient()
): Promise<AirtableGenericRecord> => {
  const url = `${client.baseUrl}/${encodeURIComponent(tableName)}/${encodeURIComponent(recordId)}`;
  const res = await fetch(url, {
    headers: client.headers,
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable error ${res.status}: ${text}`);
  }
  return (await res.json()) as AirtableGenericRecord;
};

const patchRecordFields = async ({
  tableName,
  recordId,
  fields,
  client = getClient(),
}: {
  tableName: string;
  recordId: string;
  fields: Record<string, unknown>;
  client?: AirtableClient;
}): Promise<AirtableGenericRecord> => {
  const url = `${client.baseUrl}/${encodeURIComponent(tableName)}/${encodeURIComponent(recordId)}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: client.headers,
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable error ${res.status}: ${text}`);
  }
  return (await res.json()) as AirtableGenericRecord;
};

const uploadAttachmentToRecord = async ({
  baseId,
  authToken,
  recordId,
  attachmentFieldIdOrName,
  filename,
  contentType,
  fileBase64,
}: {
  baseId: string;
  authToken: string;
  recordId: string;
  attachmentFieldIdOrName: string;
  filename: string;
  contentType: string;
  fileBase64: string;
}) => {
  const url = `https://content.airtable.com/v0/${encodeURIComponent(
    baseId
  )}/${encodeURIComponent(recordId)}/${encodeURIComponent(attachmentFieldIdOrName)}/uploadAttachment`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      contentType,
      filename,
      file: fileBase64,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable uploadAttachment error ${res.status}: ${text}`);
  }
};

export const createCatalogoRepuesto = async ({
  nombre,
  descripcionCorta,
  skuCodigoInterno,
  costoBase,
  precioSugeridoCliente,
  proveedorHabitual,
  activo = true,
}: {
  nombre: string;
  descripcionCorta?: string | null;
  skuCodigoInterno?: string | null;
  costoBase?: number | null;
  precioSugeridoCliente?: number | null;
  proveedorHabitual?: string | null;
  activo?: boolean;
}): Promise<CatalogoRepuesto> => {
  const fields: Record<string, unknown> = {
    "Nombre del repuesto": nombre.trim(),
    Activo: activo,
  };

  if (descripcionCorta && descripcionCorta.trim()) {
    fields["Descripción corta"] = descripcionCorta.trim();
  }
  if (skuCodigoInterno && skuCodigoInterno.trim()) {
    fields["SKU o código interno"] = skuCodigoInterno.trim();
  }
  if (costoBase !== null && costoBase !== undefined) {
    fields["Costo base"] = costoBase;
  }
  if (precioSugeridoCliente !== null && precioSugeridoCliente !== undefined) {
    fields["Precio sugerido al cliente"] = precioSugeridoCliente;
  }
  if (proveedorHabitual && proveedorHabitual.trim()) {
    fields["Proveedor habitual"] = proveedorHabitual.trim();
  }

  const created = await createRecord(AIRTABLE_TABLES.catalogoRepuestos, fields);
  return mapCatalogoRepuestoRecord(created);
};

export const updateCatalogoRepuesto = async ({
  id,
  nombre,
  descripcionCorta,
  skuCodigoInterno,
  proveedorHabitual,
  costoBase,
  precioSugeridoCliente,
  activo,
}: {
  id: string;
  nombre?: string | null;
  descripcionCorta?: string | null;
  skuCodigoInterno?: string | null;
  proveedorHabitual?: string | null;
  costoBase?: number | null;
  precioSugeridoCliente?: number | null;
  activo?: boolean;
}): Promise<CatalogoRepuesto> => {
  const fields: Record<string, unknown> = {};

  if (nombre !== undefined) {
    const trimmed = nombre?.trim() || "";
    if (!trimmed) throw new Error("El nombre del repuesto es obligatorio");
    fields["Nombre del repuesto"] = trimmed;
  }
  if (descripcionCorta !== undefined) fields["Descripción corta"] = descripcionCorta?.trim() || "";
  if (skuCodigoInterno !== undefined) fields["SKU o código interno"] = skuCodigoInterno?.trim() || "";
  if (proveedorHabitual !== undefined) fields["Proveedor habitual"] = proveedorHabitual?.trim() || "";
  if (costoBase !== undefined) fields["Costo base"] = costoBase;
  if (precioSugeridoCliente !== undefined) fields["Precio sugerido al cliente"] = precioSugeridoCliente;
  if (activo !== undefined) fields.Activo = activo;

  const updated = await patchRecordFields({
    tableName: AIRTABLE_TABLES.catalogoRepuestos,
    recordId: id,
    fields,
  });
  return mapCatalogoRepuestoRecord(updated);
};

export const createCatalogoServicio = async ({
  nombre,
  descripcion,
  costoSugerido,
  activo = true,
}: {
  nombre: string;
  descripcion?: string | null;
  costoSugerido?: number | null;
  activo?: boolean;
}): Promise<CatalogoServicio> => {
  const fields: Record<string, unknown> = {
    "Nombre del servicio": nombre.trim(),
    Activo: activo,
  };

  if (descripcion && descripcion.trim()) {
    fields["Descripción"] = descripcion.trim();
  }
  if (costoSugerido !== null && costoSugerido !== undefined) {
    fields["Costo sugerido"] = costoSugerido;
  }

  const created = await createRecord(AIRTABLE_TABLES.catalogoServicios, fields);
  return mapCatalogoServicioRecord(created);
};

export const updateCatalogoServicio = async ({
  id,
  nombre,
  descripcion,
  costoSugerido,
  activo,
}: {
  id: string;
  nombre?: string | null;
  descripcion?: string | null;
  costoSugerido?: number | null;
  activo?: boolean;
}): Promise<CatalogoServicio> => {
  const fields: Record<string, unknown> = {};

  if (nombre !== undefined) {
    const trimmed = nombre?.trim() || "";
    if (!trimmed) throw new Error("El nombre del servicio es obligatorio");
    fields["Nombre del servicio"] = trimmed;
  }
  if (descripcion !== undefined) fields["Descripción"] = descripcion?.trim() || "";
  if (costoSugerido !== undefined) fields["Costo sugerido"] = costoSugerido;
  if (activo !== undefined) fields.Activo = activo;

  const updated = await patchRecordFields({
    tableName: AIRTABLE_TABLES.catalogoServicios,
    recordId: id,
    fields,
  });
  return mapCatalogoServicioRecord(updated);
};

export const createRepuestoPorOrden = async ({
  ordenRecordId,
  catalogoRepuestoId,
  nombreSnapshot,
  cantidad,
  precioCliente,
  costoProveedor,
  proveedor,
  observacion,
}: {
  ordenRecordId: string;
  catalogoRepuestoId: string;
  nombreSnapshot: string;
  cantidad: number;
  precioCliente: number;
  costoProveedor?: number | null;
  proveedor?: string | null;
  observacion?: string | null;
}): Promise<RepuestoPorOrden> => {
  const fechaRegistro = formatAirtableDateOnly();
  const fields: Record<string, unknown> = {
    "Orden de Reparación": [ordenRecordId],
    "Repuesto del Catálogo": [catalogoRepuestoId],
    "Nombre del repuesto snapshot o copiado": nombreSnapshot.trim(),
    Cantidad: cantidad,
    "Precio cliente real": precioCliente,
    "Fecha de registro": fechaRegistro,
  };

  if (costoProveedor !== null && costoProveedor !== undefined) {
    fields["Costo proveedor real"] = costoProveedor;
  }
  if (proveedor && proveedor.trim()) {
    fields["Proveedor real"] = proveedor.trim();
  }
  if (observacion && observacion.trim()) {
    fields["Observación"] = observacion.trim();
  }

  const created = await createRecord(AIRTABLE_TABLES.repuestosPorOrden, fields);

  return mapRepuestoPorOrdenRecord(created, ordenRecordId);
};

export const createServicioPorOrden = async ({
  ordenRecordId,
  catalogoServicioId,
  nombreSnapshot,
  costo,
  observacion,
}: {
  ordenRecordId: string;
  catalogoServicioId: string;
  nombreSnapshot: string;
  costo: number;
  observacion?: string | null;
}): Promise<ServicioPorOrden> => {
  const fechaRegistro = formatAirtableDateOnly();
  const fields: Record<string, unknown> = {
    "Orden de Reparación": [ordenRecordId],
    "Servicio del Catálogo": [catalogoServicioId],
    "Nombre del servicio snapshot o copiado": nombreSnapshot.trim(),
    "Costo real": costo,
    "Fecha de registro": fechaRegistro,
  };

  if (observacion && observacion.trim()) {
    fields["Observación"] = observacion.trim();
  }

  const created = await createRecord(AIRTABLE_TABLES.serviciosPorOrden, fields);

  return mapServicioPorOrdenRecord(created, ordenRecordId);
};

// Combina una fecha (YYYY-MM-DD, capturada en el modal) con la hora actual en
// Ecuador (UTC-5), igual que hace el modal de abonos de operaciones.
const combineFechaConHoraActualEcuador = (fechaSoloFecha: string): string => {
  const ahoraEcuador = new Date(Date.now() - 5 * 60 * 60 * 1000);
  const horaMinuto = ahoraEcuador.toISOString().slice(11, 16);
  return `${fechaSoloFecha}T${horaMinuto}:00.000-05:00`;
};

export const createAbonoPorOrden = async ({
  ordenRecordId,
  fecha,
  monto,
  metodoPago,
  observacion,
  numeroTransaccion,
  registradoPor,
  comprobante,
  comprobanteArchivo,
}: {
  ordenRecordId: string;
  fecha?: string | null;
  monto: number;
  metodoPago?: string | null;
  observacion?: string | null;
  numeroTransaccion?: string | null;
  registradoPor?: string | null;
  comprobante?: string | null;
  comprobanteArchivo?: {
    filename: string;
    contentType: string;
    fileBase64: string;
  } | null;
}): Promise<{ abono: AbonoPorOrden; warning?: string | null }> => {
  const { token, baseId } = loadAirtableEnv();
  const client = getClient();

  // Detecta si la orden tiene una Operación Comercial vinculada leyendo el
  // campo inverso "Operaciones Comerciales" (nunca filtrar por link).
  const ordenRecord = await fetchRecordById(AIRTABLE_TABLES.ordenes, ordenRecordId, client);
  const operacionId = toLinkedRecordIds(ordenRecord.fields?.["Operaciones Comerciales"])[0] ?? null;

  // Un solo generador de "ID Abono" para toda la tabla, compartido con
  // operaciones y reservas. Verifica los números ya ocupados antes de elegir.
  const nextIdAbono = await reservarSiguienteIdAbono();

  const fechaSoloFecha = (fecha ?? "").trim() || formatAirtableDateOnly();
  const fechaAbono = combineFechaConHoraActualEcuador(fechaSoloFecha);

  const fields: Record<string, unknown> = {
    "ID Abono": nextIdAbono,
    Monto: monto,
    "Fecha de Abono": fechaAbono,
    "Estado del Abono": "Registrado",
    "Aplicado a: Orden": [ordenRecordId],
  };

  if (operacionId) {
    fields["Aplicado a: Operación"] = [operacionId];
  }
  if (metodoPago && metodoPago.trim()) {
    fields["Método de Pago"] = metodoPago.trim();
  }
  if (numeroTransaccion && numeroTransaccion.trim()) {
    fields["Número de Transacción"] = numeroTransaccion.trim();
  }
  if (observacion && observacion.trim()) {
    fields["Observación"] = observacion.trim();
  }
  if (registradoPor && registradoPor.trim()) {
    fields["Registrado Por"] = registradoPor.trim();
  }

  // Si Comprobante es attachment, Airtable acepta un arreglo con URLs.
  if (comprobante && /^https?:\/\//i.test(comprobante.trim())) {
    fields.Comprobante = [{ url: comprobante.trim() }];
  }

  const created = await createRecord(AIRTABLE_TABLES.abonos, fields, client);
  let warning: string | null = null;

  if (comprobanteArchivo?.fileBase64) {
    try {
      await uploadAttachmentToRecord({
        baseId,
        authToken: token,
        recordId: created.id,
        attachmentFieldIdOrName: "Comprobante",
        filename: comprobanteArchivo.filename,
        contentType: comprobanteArchivo.contentType,
        fileBase64: comprobanteArchivo.fileBase64,
      });
    } catch (error) {
      console.error("No se pudo subir el comprobante del abono:", error);
      warning = "El abono se guardó, pero no se pudo subir el comprobante.";
    }
  }

  const fresh = await fetchRecordById(AIRTABLE_TABLES.abonos, created.id, client);
  return {
    abono: mapAbonoRecord(fresh, ordenRecordId),
    warning,
  };
};

export const addComprobanteToAbonoPorOrdenById = async ({
  abonoPorOrdenRecordId,
  comprobanteArchivo,
}: {
  abonoPorOrdenRecordId: string;
  comprobanteArchivo: {
    filename: string;
    contentType: string;
    fileBase64: string;
  };
}): Promise<{ abono: AbonoPorOrden; warning?: string | null }> => {
  const recordId = abonoPorOrdenRecordId.trim();
  if (!recordId) {
    throw new Error("Falta id de abono por orden");
  }

  const { token, baseId } = loadAirtableEnv();
  const client = getClient();
  let warning: string | null = null;

  try {
    await uploadAttachmentToRecord({
      baseId,
      authToken: token,
      recordId,
      attachmentFieldIdOrName: "Comprobante",
      filename: comprobanteArchivo.filename,
      contentType: comprobanteArchivo.contentType,
      fileBase64: comprobanteArchivo.fileBase64,
    });
  } catch (error) {
    console.error("No se pudo agregar comprobante al abono:", error);
    warning = "No se pudo subir el comprobante.";
  }

  const fresh = await fetchRecordById(AIRTABLE_TABLES.abonos, recordId, client);
  const ordenId = firstLinkedRecordId(fresh.fields?.["Aplicado a: Orden"]) ?? "";
  return {
    abono: mapAbonoRecord(fresh, ordenId),
    warning,
  };
};

export const deleteComprobanteFromAbonoPorOrdenById = async ({
  abonoPorOrdenRecordId,
  attachmentId,
}: {
  abonoPorOrdenRecordId: string;
  attachmentId: string;
}): Promise<{ abono: AbonoPorOrden }> => {
  const recordId = abonoPorOrdenRecordId.trim();
  const removeId = attachmentId.trim();
  if (!recordId) {
    throw new Error("Falta id de abono por orden");
  }
  if (!removeId) {
    throw new Error("Falta id del adjunto");
  }

  const client = getClient();
  const current = await fetchRecordById(AIRTABLE_TABLES.abonos, recordId, client);
  const allAttachments = parseAttachments(current.fields?.["Comprobante"]);
  const filtered = allAttachments.filter((attachment) => attachment.id !== removeId);

  if (filtered.length === allAttachments.length) {
    throw new Error("No se encontró el adjunto seleccionado en este abono.");
  }

  await patchRecordFields({
    tableName: AIRTABLE_TABLES.abonos,
    recordId,
    fields: {
      Comprobante: filtered.map((attachment) =>
        attachment.id ? { id: attachment.id } : { url: attachment.url }
      ),
    },
    client,
  });

  const fresh = await fetchRecordById(AIRTABLE_TABLES.abonos, recordId, client);
  const ordenId = firstLinkedRecordId(fresh.fields?.["Aplicado a: Orden"]) ?? "";
  return {
    abono: mapAbonoRecord(fresh, ordenId),
  };
};

export const addDocumentosToOrdenById = async ({
  ordenRecordId,
  documentos,
}: {
  ordenRecordId: string;
  documentos: Array<{
    filename: string;
    contentType: string;
    fileBase64: string;
  }>;
}): Promise<{ orden: OrdenDetalle; warning?: string | null }> => {
  const recordId = ordenRecordId.trim();
  if (!recordId) {
    throw new Error("Falta id de la orden");
  }
  if (!documentos.length) {
    throw new Error("Debes seleccionar al menos un documento.");
  }

  const { token, baseId } = loadAirtableEnv();
  const client = getClient();
  await fetchRecordById(AIRTABLE_TABLES.ordenes, recordId, client);

  const failedFiles: string[] = [];

  for (const documento of documentos) {
    try {
      await uploadAttachmentToRecord({
        baseId,
        authToken: token,
        recordId,
        attachmentFieldIdOrName: "Documentos",
        filename: documento.filename,
        contentType: documento.contentType,
        fileBase64: documento.fileBase64,
      });
    } catch (error) {
      console.error("No se pudo agregar documento a la orden:", error);
      failedFiles.push(documento.filename);
    }
  }

  if (failedFiles.length === documentos.length) {
    throw new Error("No se pudo subir ningún documento.");
  }

  const orden = await fetchOrdenById(recordId);
  if (!orden) {
    throw new Error("No se pudo refrescar la orden.");
  }

  return {
    orden,
    warning: failedFiles.length
      ? `No se pudieron subir: ${failedFiles.join(", ")}.`
      : null,
  };
};

export const deleteDocumentoFromOrdenById = async ({
  ordenRecordId,
  attachmentId,
}: {
  ordenRecordId: string;
  attachmentId: string;
}): Promise<{ orden: OrdenDetalle }> => {
  const recordId = ordenRecordId.trim();
  const removeId = attachmentId.trim();
  if (!recordId) {
    throw new Error("Falta id de la orden");
  }
  if (!removeId) {
    throw new Error("Falta id del documento");
  }

  const client = getClient();
  const current = await fetchRecordById(AIRTABLE_TABLES.ordenes, recordId, client);
  const allAttachments = parseAttachments(current.fields?.["Documentos"]);
  const filtered = allAttachments.filter((attachment) => attachment.id !== removeId);

  if (filtered.length === allAttachments.length) {
    throw new Error("No se encontró el documento seleccionado en esta orden.");
  }

  await patchRecordFields({
    tableName: AIRTABLE_TABLES.ordenes,
    recordId,
    fields: {
      Documentos: filtered.map((attachment) =>
        attachment.id ? { id: attachment.id } : { url: attachment.url }
      ),
    },
    client,
  });

  const orden = await fetchOrdenById(recordId);
  if (!orden) {
    throw new Error("No se pudo refrescar la orden.");
  }

  return { orden };
};

const mapHistorialRecord = (
  record: { id: string; fields: Record<string, unknown>; createdTime?: string },
  ordenId: string
): HistorialEstado => {
  const f = record.fields ?? {};
  const tecnicoNombreRaw = firstString(f["Tecnico Nombre"], "");
  const tecnicoIdRaw = firstString(f["Tecnico"], "");
  const notaRaw = safeString(f["Estado Nuevo"], "");

  return {
    id: safeString(f["ID"], record.id),
    ordenId,
    estadoNuevo: safeString(f["Estado Nuevo"], "Sin estado") as EstadoOrden,
    fecha: safeString(f["Fecha"], record.createdTime ?? ""),
    tecnicoId: tecnicoIdRaw || null,
    tecnicoNombre: tecnicoNombreRaw || null,
    nota: notaRaw || null,
    creadoDesdeAppTecnico: Boolean(f["Creado desde App TÃ©cnico"]),
    estadoGeneradoIA: safeString(f["Estado Generado IA"], "") || null,
    solicitarMensajeCliente: Boolean(f["Solicitar Mensaje Cliente"]),
    creadoPorNombre: safeString(f["Creado por Nombre"], "") || null,
    creadoPorEmail: safeString(f["Creado por Email"], "") || null,
    creadoPorUsuarioId: safeString(f["Creado por Usuario ID"], "") || null,
  };
};

export const fetchHistorialById = async (
  recordId: string,
  client = getClient()
): Promise<HistorialEstado | null> => {
  const url = `${client.baseUrl}/${encodeURIComponent(
    AIRTABLE_TABLES.historial
  )}/${encodeURIComponent(recordId)}`;

  const res = await fetch(url, {
    headers: client.headers,
    cache: "no-store",
  });

  if (res.status === 404) return null;
  if (!res.ok) return null;

  const payload = (await res.json()) as { id: string; fields: Record<string, unknown>; createdTime?: string };
  return mapHistorialRecord(payload, "");
};

// --- Escritura: actualizar estado de la orden + historial ---
export const updateOrdenEstado = async ({
  ordenRecordId,
  nuevoEstado,
  tecnicoId,
  tecnicoNombre,
  creadoPorNombre,
  creadoPorEmail,
  creadoPorUsuarioId,
}: {
  ordenRecordId: string;
  nuevoEstado: EstadoOrden;
  tecnicoId?: string | null;
  tecnicoNombre?: string | null;
  creadoPorNombre?: string | null;
  creadoPorEmail?: string | null;
  creadoPorUsuarioId?: string | null;
}): Promise<{ estadoActual: EstadoOrden; historial: HistorialEstado }> => {
  if (!ESTADOS_ORDEN.includes(nuevoEstado)) {
    throw new Error("Estado no permitido");
  }

  const client = getClient();
  const urlOrden = `${client.baseUrl}/${encodeURIComponent(
    AIRTABLE_TABLES.ordenes
  )}/${encodeURIComponent(ordenRecordId)}`;

  const resOrden = await fetch(urlOrden, {
    method: "PATCH",
    headers: client.headers,
    body: JSON.stringify({ fields: { "Estado Actual": nuevoEstado } }),
  });

  if (!resOrden.ok) {
    const text = await resOrden.text();
    throw new Error(`Airtable error ${resOrden.status}: ${text}`);
  }

  const historial = await createHistorialEntrada({
    ordenRecordId,
    estadoNuevo: nuevoEstado,
    tecnicoId,
    tecnicoNombre,
    creadoPorNombre,
    creadoPorEmail,
    creadoPorUsuarioId,
  });

  return { estadoActual: nuevoEstado, historial };
};

export const markOrdenBajaInterna = async ({
  ordenRecordId,
  daysWaiting,
  creadoPorNombre,
  creadoPorEmail,
  creadoPorUsuarioId,
}: {
  ordenRecordId: string;
  daysWaiting: number;
  creadoPorNombre?: string | null;
  creadoPorEmail?: string | null;
  creadoPorUsuarioId?: string | null;
}): Promise<{ estadoActual: EstadoOrden; historial: HistorialEstado }> => {
  const estado: EstadoOrden = "Enviado a Reciclaje";
  const client = getClient();
  const urlOrden = `${client.baseUrl}/${encodeURIComponent(
    AIRTABLE_TABLES.ordenes
  )}/${encodeURIComponent(ordenRecordId)}`;

  const resOrden = await fetch(urlOrden, {
    method: "PATCH",
    headers: client.headers,
    body: JSON.stringify({ fields: { "Estado Actual": estado } }),
  });

  if (!resOrden.ok) {
    const text = await resOrden.text();
    throw new Error(`Airtable error ${resOrden.status}: ${text}`);
  }

  const historial = await createHistorialEntrada({
    ordenRecordId,
    estadoNuevo: `Orden marcada como baja interna por política de abandono. Cliente sin respuesta durante ${daysWaiting} días.`,
    creadoPorNombre,
    creadoPorEmail,
    creadoPorUsuarioId,
  });

  return { estadoActual: estado, historial };
};

// --- Escritura: actualizar nota interna ---
export const updateOrdenNotaInterna = async ({
  ordenRecordId,
  notaInterna,
}: {
  ordenRecordId: string;
  notaInterna: string;
}): Promise<{ notaInterna: string }> => {
  const client = getClient();
  const urlOrden = `${client.baseUrl}/${encodeURIComponent(
    AIRTABLE_TABLES.ordenes
  )}/${encodeURIComponent(ordenRecordId)}`;

  const tryUpdate = async (fieldName: string) => {
    const res = await fetch(urlOrden, {
      method: "PATCH",
      headers: client.headers,
      body: JSON.stringify({ fields: { [fieldName]: notaInterna } }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Airtable error ${res.status}: ${text}`);
    }
  };

  try {
    await tryUpdate("Nota interna");
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("UNKNOWN_FIELD_NAME")) {
      await tryUpdate("Nota Interna");
    } else {
      throw err;
    }
  }

  return { notaInterna };
};

// --- Escritura: fecha impresa en la etiqueta de mantenimiento ---
export const updateOrdenProximoMantenimiento = async ({
  ordenRecordId,
  fecha,
}: {
  ordenRecordId: string;
  /** YYYY-MM-DD */
  fecha: string;
}): Promise<{ proximoMantenimiento: string }> => {
  const client = getClient();
  const urlOrden = `${client.baseUrl}/${encodeURIComponent(
    AIRTABLE_TABLES.ordenes
  )}/${encodeURIComponent(ordenRecordId)}`;

  const res = await fetch(urlOrden, {
    method: "PATCH",
    headers: client.headers,
    // Cada fecha nueva es un ciclo de aviso nuevo: se resetea el flag de
    // notificado aunque el ciclo anterior ya se hubiera avisado.
    body: JSON.stringify({
      fields: { "Próximo Mantenimiento": fecha, "Mantenimiento Notificado": false },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable error ${res.status}: ${text}`);
  }

  return { proximoMantenimiento: fecha };
};

// --- Escritura: marcar/desmarcar el aviso de mantenimiento como enviado ---
export const marcarMantenimientoNotificado = async ({
  ordenRecordId,
  notificado,
}: {
  ordenRecordId: string;
  notificado: boolean;
}): Promise<{ mantenimientoNotificado: boolean }> => {
  const client = getClient();
  const urlOrden = `${client.baseUrl}/${encodeURIComponent(
    AIRTABLE_TABLES.ordenes
  )}/${encodeURIComponent(ordenRecordId)}`;

  const res = await fetch(urlOrden, {
    method: "PATCH",
    headers: client.headers,
    body: JSON.stringify({ fields: { "Mantenimiento Notificado": notificado } }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable error ${res.status}: ${text}`);
  }

  return { mantenimientoNotificado: notificado };
};

// --- Lectura: listado de seguimiento de mantenimientos próximos ---
// Trae TODAS las órdenes con una fecha de próximo mantenimiento guardada,
// ordenadas ascendente (las más próximas a vencer primero). El volumen
// esperado es bajo (solo órdenes donde alguna vez se imprimió esta
// etiqueta), así que se pagina hasta agotar el offset en vez de limitar
// a una sola página.
export const fetchMantenimientosProximos = async (): Promise<MantenimientoProximo[]> => {
  const client = getClient();
  const registros: { id: string; fields: Record<string, unknown> }[] = [];
  let offset: string | undefined;

  do {
    const url = new URL(`${client.baseUrl}/${encodeURIComponent(AIRTABLE_TABLES.ordenes)}`);
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("filterByFormula", "NOT({Próximo Mantenimiento} = '')");
    url.searchParams.append("sort[0][field]", "Próximo Mantenimiento");
    url.searchParams.append("sort[0][direction]", "asc");
    [
      "ID",
      "ClienteTXT",
      "Cliente",
      "Telefono",
      "Equipo",
      "Próximo Mantenimiento",
      "Mantenimiento Notificado",
    ].forEach((field) => url.searchParams.append("fields[]", field));
    if (offset) url.searchParams.set("offset", offset);

    const res = await fetch(url.toString(), { headers: client.headers, cache: "no-store" });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Airtable error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as {
      records?: { id: string; fields: Record<string, unknown> }[];
      offset?: string;
    };
    registros.push(...(data.records ?? []));
    offset = data.offset;
  } while (offset);

  return registros.map((record) => {
    const f = record.fields;
    let clienteNombre = firstString(f["ClienteTXT"], "");
    if (clienteNombre.startsWith("rec")) clienteNombre = "";
    if (!clienteNombre) {
      const cli = firstString(f["Cliente"], "");
      clienteNombre = cli && !cli.startsWith("rec") ? cli : "";
    }
    if (!clienteNombre) clienteNombre = "Cliente no disponible";

    return {
      ordenRecordId: record.id,
      idVisible: safeString(f["ID"], record.id),
      clienteNombre,
      telefono: safeString(f["Telefono"], "-"),
      equipo: safeString(f["Equipo"], "Sin equipo"),
      proximoMantenimiento: safeString(f["Próximo Mantenimiento"], ""),
      mantenimientoNotificado: f["Mantenimiento Notificado"] === true,
    };
  });
};

// --- Escritura: actualizar campos directos de la orden ---
export const updateOrdenCampos = async ({
  ordenRecordId,
  campos,
}: {
  ordenRecordId: string;
  campos: Partial<{ equipo: string; accesorios: string; telefono: string; ingresaPor: string; cotizacionId: string; cotizacionCodigo: string }>;
}): Promise<void> => {
  const client = getClient();
  const url = `${client.baseUrl}/${encodeURIComponent(
    AIRTABLE_TABLES.ordenes
  )}/${encodeURIComponent(ordenRecordId)}`;

  const fields: Record<string, string> = {};
  if (campos.equipo !== undefined) fields["Equipo"] = campos.equipo;
  if (campos.accesorios !== undefined) fields["Accesorios"] = campos.accesorios;
  if (campos.ingresaPor !== undefined) fields["Ingresa Por"] = campos.ingresaPor;
  if (campos.cotizacionId !== undefined) fields["Cotización ID"] = campos.cotizacionId;
  if (campos.cotizacionCodigo !== undefined) fields["Cotización Código"] = campos.cotizacionCodigo;

  const doUpdate = async (f: Record<string, string>) => {
    const res = await fetch(url, {
      method: "PATCH",
      headers: client.headers,
      body: JSON.stringify({ fields: f }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Airtable error ${res.status}: ${text}`);
    }
  };

  if (campos.telefono !== undefined) {
    try {
      await doUpdate({ ...fields, Telefono: campos.telefono });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("UNKNOWN_FIELD_NAME")) {
        await doUpdate({ ...fields, "Teléfono": campos.telefono });
      } else {
        throw err;
      }
    }
  } else if (Object.keys(fields).length > 0) {
    await doUpdate(fields);
  }
};

// --- Escritura: marcar solicitud de mensaje cliente en historial ---
export const updateHistorialSolicitarMensaje = async ({
  historialRecordId,
  solicitar = true,
}: {
  historialRecordId: string;
  solicitar?: boolean;
}): Promise<{ solicitarMensajeCliente: boolean }> => {
  const client = getClient();
  const url = `${client.baseUrl}/${encodeURIComponent(
    AIRTABLE_TABLES.historial
  )}/${encodeURIComponent(historialRecordId)}`;

  const res = await fetch(url, {
    method: "PATCH",
    headers: client.headers,
    body: JSON.stringify({ fields: { "Solicitar Mensaje Cliente": solicitar } }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable error ${res.status}: ${text}`);
  }

  return { solicitarMensajeCliente: solicitar };
};

// --- Escritura: actualizar campos base del historial ---
export const updateHistorialEstado = async ({
  historialRecordId,
  estadoNuevo,
  estadoGeneradoIA,
}: {
  historialRecordId: string;
  estadoNuevo?: string;
  estadoGeneradoIA?: string | null;
}): Promise<HistorialEstado> => {
  const client = getClient();
  const url = `${client.baseUrl}/${encodeURIComponent(
    AIRTABLE_TABLES.historial
  )}/${encodeURIComponent(historialRecordId)}`;

  const fields: Record<string, unknown> = {};
  if (estadoNuevo !== undefined) fields["Estado Nuevo"] = estadoNuevo;
  if (estadoGeneradoIA !== undefined) fields["Estado Generado IA"] = estadoGeneradoIA ?? "";

  if (Object.keys(fields).length === 0) {
    throw new Error("No hay campos para actualizar en el historial");
  }

  const res = await fetch(url, {
    method: "PATCH",
    headers: client.headers,
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    id: string;
    fields: Record<string, unknown>;
    createdTime?: string;
  };

  return mapHistorialRecord(data, "");
};

// --- Escritura: eliminar historial ---
export const deleteHistorialById = async ({
  historialRecordId,
}: {
  historialRecordId: string;
}): Promise<{ deleted: boolean }> => {
  const client = getClient();
  const url = `${client.baseUrl}/${encodeURIComponent(
    AIRTABLE_TABLES.historial
  )}/${encodeURIComponent(historialRecordId)}`;

  const res = await fetch(url, {
    method: "DELETE",
    headers: client.headers,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable error ${res.status}: ${text}`);
  }

  return { deleted: true };
};

const deleteRecordById = async ({
  tableName,
  recordId,
  client = getClient(),
}: {
  tableName: string;
  recordId: string;
  client?: AirtableClient;
}): Promise<void> => {
  const url = `${client.baseUrl}/${encodeURIComponent(tableName)}/${encodeURIComponent(recordId)}`;

  const res = await fetch(url, {
    method: "DELETE",
    headers: client.headers,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable error ${res.status}: ${text}`);
  }
};

export const deleteRepuestoPorOrdenById = async ({
  repuestoPorOrdenRecordId,
}: {
  repuestoPorOrdenRecordId: string;
}): Promise<{ deleted: boolean }> => {
  const recordId = repuestoPorOrdenRecordId.trim();
  if (!recordId) {
    throw new Error("Falta id de repuesto por orden");
  }

  await deleteRecordById({
    tableName: AIRTABLE_TABLES.repuestosPorOrden,
    recordId,
  });

  return { deleted: true };
};

export const deleteServicioPorOrdenById = async ({
  servicioPorOrdenRecordId,
}: {
  servicioPorOrdenRecordId: string;
}): Promise<{ deleted: boolean }> => {
  const recordId = servicioPorOrdenRecordId.trim();
  if (!recordId) {
    throw new Error("Falta id de servicio por orden");
  }

  await deleteRecordById({
    tableName: AIRTABLE_TABLES.serviciosPorOrden,
    recordId,
  });

  return { deleted: true };
};

// Reemplaza el borrado físico: en la tabla nueva "Abonos" un abono se anula
// (Estado del Abono = "Anulado") para conservar constancia, nunca se elimina.
export const anularAbonoPorOrden = async ({
  abonoRecordId,
}: {
  abonoRecordId: string;
}): Promise<{ abono: AbonoPorOrden }> => {
  const recordId = abonoRecordId.trim();
  if (!recordId) {
    throw new Error("Falta id del abono");
  }

  const client = getClient();
  const current = await fetchRecordById(AIRTABLE_TABLES.abonos, recordId, client);
  const estadoActual = pickStringField(current.fields ?? {}, ["Estado del Abono"], "Registrado");
  if (estadoActual === "Anulado") {
    throw new Error("Este abono ya está anulado.");
  }

  await patchRecordFields({
    tableName: AIRTABLE_TABLES.abonos,
    recordId,
    fields: { "Estado del Abono": "Anulado" },
    client,
  });

  const fresh = await fetchRecordById(AIRTABLE_TABLES.abonos, recordId, client);
  const ordenId = firstLinkedRecordId(fresh.fields?.["Aplicado a: Orden"]) ?? "";
  return {
    abono: mapAbonoRecord(fresh, ordenId),
  };
};

// --- Escritura: agregar avance (historial) ---
export const createHistorialEntrada = async ({
  ordenRecordId,
  avanceTexto,
  estadoNuevo,
  tecnicoId,
  tecnicoNombre,
  creadoPorNombre,
  creadoPorEmail,
  creadoPorUsuarioId,
}: {
  ordenRecordId: string;
  avanceTexto?: string;
  estadoNuevo?: string;
  tecnicoId?: string | null;
  tecnicoNombre?: string | null;
  creadoPorNombre?: string | null;
  creadoPorEmail?: string | null;
  creadoPorUsuarioId?: string | null;
}): Promise<HistorialEstado> => {
  const client = getClient();
  const url = `${client.baseUrl}/${encodeURIComponent(AIRTABLE_TABLES.historial)}`;

  const texto = (estadoNuevo ?? avanceTexto ?? "").trim();
  if (!texto) {
    throw new Error("El historial requiere un texto de estado");
  }

  const ordenFieldCandidates = [
    "Orden",
    "Orden de Reparaci\u00f3n",
    "\u00d3rdenes de Reparaci\u00f3n",
  ];
  const creadoDesdeAppFieldCandidates = [
    "Creado desde App T\u00e9cnico",
    "Creado desde App Tecnico",
  ];

  // Intentamos primero con los campos de autor\u00eda; si Airtable no los tiene a\u00fan,
  // el loop de fallback los omite en la \u00faltima pasada.
  const useMetaFields = [true, false];

  let data:
    | {
        id: string;
        fields: Record<string, unknown>;
        createdTime?: string;
      }
    | null = null;
  let lastError: Error | null = null;

  outer: for (const withMeta of useMetaFields) {
    for (const ordenField of ordenFieldCandidates) {
      for (const creadoDesdeAppField of creadoDesdeAppFieldCandidates) {
        const fields: Record<string, unknown> = {
          [ordenField]: [ordenRecordId],
          "Estado Nuevo": texto,
          [creadoDesdeAppField]: true,
          Fecha: formatAirtableDateTimeISO(),
        };

        if (tecnicoNombre) {
          fields["Tecnico Nombre"] = tecnicoNombre;
        }
        if (tecnicoId) {
          fields["Tecnico"] = [tecnicoId];
        }

        if (withMeta) {
          if (creadoPorNombre) fields["Creado por Nombre"] = creadoPorNombre;
          if (creadoPorEmail) fields["Creado por Email"] = creadoPorEmail;
          if (creadoPorUsuarioId) fields["Creado por Usuario ID"] = creadoPorUsuarioId;
        }

        const res = await fetch(url, {
          method: "POST",
          headers: { ...client.headers },
          body: JSON.stringify({ fields }),
        });

        if (res.ok) {
          data = (await res.json()) as {
            id: string;
            fields: Record<string, unknown>;
            createdTime?: string;
          };
          break outer;
        }

        const text = await res.text();
        const error = new Error(`Airtable error ${res.status}: ${text}`);
        lastError = error;
        if (!isUnknownAirtableFieldError(error.message)) {
          throw error;
        }
      }
    }
  }

  if (!data) {
    throw lastError ?? new Error("No se pudo crear la entrada de historial");
  }

  return mapHistorialRecord(data, ordenRecordId);
};

// ─── Productos Digitales ───────────────────────────────────────────────────

const truncarClave = (clave: string | null | undefined): string | null => {
  if (!clave || clave.trim() === "") return null;
  const clean = clave.trim();
  if (clean.length <= 6) return "••••••";
  return clean.slice(0, 6) + "•••";
};

const firstAttachmentUrl = (value: unknown): string | null => {
  if (!Array.isArray(value) || value.length === 0) return null;
  const first = value[0] as { url?: unknown };
  return typeof first.url === "string" && first.url ? first.url : null;
};

// Lookup fields return arrays. These helpers extract the first value safely.
const firstLookupStr = (value: unknown): string | null => {
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0];
    if (typeof first === "string") return first || null;
  }
  if (typeof value === "string") return value || null;
  return null;
};

const firstLookupNum = (value: unknown): number | null => {
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0];
    if (typeof first === "number" && Number.isFinite(first)) return first;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
};

// Logo lookup comes as an array of attachment arrays: [[{url, ...}]]
const firstLookupAttachmentUrl = (value: unknown): string | null => {
  if (!Array.isArray(value) || value.length === 0) return null;
  const first = value[0];
  if (Array.isArray(first) && first.length > 0) {
    const att = first[0] as { url?: unknown };
    return typeof att?.url === "string" ? att.url : null;
  }
  if (first && typeof first === "object") {
    const att = first as { url?: unknown };
    return typeof att.url === "string" ? att.url : null;
  }
  return null;
};

const mapCatalogoProductoDigitalRecord = (
  record: { id: string; fields: Record<string, unknown> }
): CatalogoProductoDigital => {
  const f = record.fields ?? {};
  return {
    id: record.id,
    productoBase: safeString(f["Producto Base"], "Sin nombre"),
    marca: firstLookupStr(f["Marca"]),
    tipo: firstLookupStr(f["Tipo"]),
    portalActivacion: safeString(f["Portal de Activación"], "") || null,
    instruccionesPdf: safeString(f["Instrucciones PDF"], "") || null,
    notasParaCliente: safeString(f["Notas para Cliente"], "") || null,
    precioVentaCatalogo: firstLookupNum(f["Precio Venta Catálogo"]) ?? firstNumber(f["Precio Venta Catálogo"]),
    colorPrincipal: safeString(f["Color Principal"], "") || null,
    activo: f["Activo"] !== false,
    logoUrl: firstAttachmentUrl(f["Logo"]),
  };
};

const mapProductoDigitalRecord = (
  record: { id: string; fields: Record<string, unknown> }
): ProductoDigital => {
  const f = record.fields ?? {};
  const ordenIds = toLinkedRecordIds(f["Orden de Reparación"]);
  const clienteIds = toLinkedRecordIds(f["Cliente"]);
  const catalogoIds = toLinkedRecordIds(f["Software / Producto"]);
  const claveRaw = typeof f["Clave de Activación"] === "string" ? f["Clave de Activación"] : null;

  return {
    id: record.id,
    catalogoId: catalogoIds[0] ?? null,
    softwareProducto: safeString(f["Producto Digital"], "") || firstLookupStr(f["Nombre Producto"]) || "Sin nombre",
    marcaProducto: firstLookupStr(f["Marca Producto"]),
    tipoProducto: firstLookupStr(f["Tipo Producto"]),
    logoProductoUrl: firstLookupAttachmentUrl(f["Logo Producto"]),
    portalActivacionCatalogo: firstLookupStr(f["Portal de Activación Catálogo"]),
    instruccionesPdfCatalogo: firstLookupStr(f["Instrucciones PDF Catálogo"]),
    notasParaClienteCatalogo: firstLookupStr(f["Notas para Cliente Catálogo"]),
    precioVentaCatalogo: firstLookupNum(f["Precio Venta Catálogo"]),
    colorPrincipalProducto: firstLookupStr(f["Color Principal Producto"]),
    estado: safeString(f["Estado"], "Disponible"),
    proveedor: safeString(f["Proveedor"], "") || null,
    costoProveedor: firstNumber(f["Costo Proveedor"]),
    precioVenta: firstNumber(f["Precio Venta"]),
    claveTruncada: truncarClave(claveRaw),
    usuarioCorreo: safeString(f["Usuario / Correo"], "") || null,
    duracion: safeString(f["Duración"], "") || null,
    expira: safeString(f["Expira"], "") || null,
    fechaCompra: safeString(f["Fecha de Compra"], "") || null,
    fechaUsoVenta: safeString(f["Fecha de Uso / Venta"], "") || null,
    ordenReparacionId: ordenIds[0] ?? null,
    clienteId: clienteIds[0] ?? null,
    tipoUso: safeString(f["Tipo de Uso"], "") || null,
    usadoVendidoPor: safeString(f["Usado/Vendido por"], "") || null,
    observacionesInternas: safeString(f["Observaciones Internas"], "") || null,
    documentoPdfUrl: firstAttachmentUrl(f["Documento PDF"]),
    documentoGeneradoPor: safeString(f["Documento generado por"], "") || null,
    fechaUltimoPdf: safeString(f["Fecha último PDF"], "") || null,
  };
};

export const fetchProductosDigitalesPorOrden = async (
  ordenRecordId: string,
  client = getClient()
): Promise<ProductoDigital[]> => {
  const records = await fetchAllTableRecords({
    tableName: AIRTABLE_TABLES.productosDigitales,
    client,
  });
  return records
    .filter((r) => toLinkedRecordIds(r.fields?.["Orden de Reparación"]).includes(ordenRecordId))
    .map(mapProductoDigitalRecord);
};

export const fetchProductosDigitalesDisponibles = async (
  query?: string,
  client = getClient()
): Promise<ProductoDigital[]> => {
  const url = new URL(
    `${client.baseUrl}/${encodeURIComponent(AIRTABLE_TABLES.productosDigitales)}`
  );
  url.searchParams.set("filterByFormula", `{Estado}="Disponible"`);
  url.searchParams.set("maxRecords", "100");
  url.searchParams.set("sort[0][field]", "Software / Producto");
  url.searchParams.set("sort[0][direction]", "asc");

  const res = await fetch(url.toString(), { headers: client.headers, cache: "no-store" });
  if (!res.ok) throw new Error(`Airtable error ${res.status}`);
  const data = (await res.json()) as { records: { id: string; fields: Record<string, unknown> }[] };

  let results = data.records.map(mapProductoDigitalRecord);

  if (query && query.trim()) {
    const q = query.trim().toLowerCase();
    results = results.filter(
      (p) =>
        p.softwareProducto.toLowerCase().includes(q) ||
        (p.tipoProducto ?? "").toLowerCase().includes(q) ||
        (p.marcaProducto ?? "").toLowerCase().includes(q) ||
        (p.proveedor ?? "").toLowerCase().includes(q)
    );
  }

  return results;
};

export const fetchProductoDigitalById = async (
  recordId: string,
  client = getClient()
): Promise<ProductoDigital | null> => {
  const url = `${client.baseUrl}/${encodeURIComponent(AIRTABLE_TABLES.productosDigitales)}/${encodeURIComponent(recordId)}`;
  const res = await fetch(url, { headers: client.headers, cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const data = (await res.json()) as { id: string; fields: Record<string, unknown> };
  return mapProductoDigitalRecord(data);
};

export const fetchAllProductosDigitales = async ({
  estado,
  query,
  client: clientParam,
}: {
  estado?: string;
  query?: string;
  client?: AirtableClient;
} = {}): Promise<ProductoDigital[]> => {
  const client = clientParam ?? getClient();
  const url = new URL(
    `${client.baseUrl}/${encodeURIComponent(AIRTABLE_TABLES.productosDigitales)}`
  );
  if (estado) {
    url.searchParams.set("filterByFormula", `{Estado}="${estado}"`);
  }
  url.searchParams.set("maxRecords", "500");
  url.searchParams.set("sort[0][field]", "Software / Producto");
  url.searchParams.set("sort[0][direction]", "asc");

  const res = await fetch(url.toString(), { headers: client.headers, cache: "no-store" });
  if (!res.ok) throw new Error(`Airtable error ${res.status}`);
  const data = (await res.json()) as { records: { id: string; fields: Record<string, unknown> }[] };

  let results = data.records.map(mapProductoDigitalRecord);

  if (query && query.trim()) {
    const q = query.trim().toLowerCase();
    results = results.filter(
      (p) =>
        p.softwareProducto.toLowerCase().includes(q) ||
        (p.tipoProducto ?? "").toLowerCase().includes(q) ||
        (p.marcaProducto ?? "").toLowerCase().includes(q) ||
        (p.proveedor ?? "").toLowerCase().includes(q) ||
        (p.estado ?? "").toLowerCase().includes(q) ||
        (p.usadoVendidoPor ?? "").toLowerCase().includes(q)
    );
  }

  return results;
};

export const createProductoDigital = async ({
  catalogoId,
  estado = "Disponible",
  proveedor,
  costoProveedor,
  precioVenta,
  claveActivacion,
  usuarioCorreo,
  contraseña,
  duracion,
  fechaCompra,
  observacionesInternas,
}: {
  catalogoId: string;
  estado?: string;
  proveedor?: string | null;
  costoProveedor?: number | null;
  precioVenta?: number | null;
  claveActivacion?: string | null;
  usuarioCorreo?: string | null;
  contraseña?: string | null;
  duracion?: string | null;
  fechaCompra?: string | null;
  observacionesInternas?: string | null;
}): Promise<ProductoDigital> => {
  const client = getClient();
  const url = `${client.baseUrl}/${encodeURIComponent(AIRTABLE_TABLES.productosDigitales)}`;

  const fields: Record<string, unknown> = {
    "Software / Producto": [catalogoId],
    "Estado": estado,
  };
  if (proveedor?.trim()) fields["Proveedor"] = proveedor.trim();
  if (costoProveedor !== undefined && costoProveedor !== null) fields["Costo Proveedor"] = costoProveedor;
  if (precioVenta !== undefined && precioVenta !== null) fields["Precio Venta"] = precioVenta;
  if (claveActivacion?.trim()) fields["Clave de Activación"] = claveActivacion.trim();
  if (usuarioCorreo?.trim()) fields["Usuario / Correo"] = usuarioCorreo.trim();
  if (contraseña?.trim()) fields["Contraseña"] = contraseña.trim();
  if (duracion?.trim()) fields["Duración"] = duracion.trim();
  if (fechaCompra?.trim()) fields["Fecha de Compra"] = fechaCompra.trim();
  if (observacionesInternas?.trim()) fields["Observaciones Internas"] = observacionesInternas.trim();

  const res = await fetch(url, {
    method: "POST",
    headers: client.headers,
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { id: string; fields: Record<string, unknown> };
  return mapProductoDigitalRecord(data);
};

// Retorna las credenciales sensibles. Solo llamar desde endpoints con sesión verificada.
export const fetchCredencialesProductoDigital = async (
  recordId: string,
  client = getClient()
): Promise<{ claveActivacion: string | null; usuarioCorreo: string | null; contraseña: string | null } | null> => {
  const url = `${client.baseUrl}/${encodeURIComponent(AIRTABLE_TABLES.productosDigitales)}/${encodeURIComponent(recordId)}`;
  const res = await fetch(url, { headers: client.headers, cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const data = (await res.json()) as { id: string; fields: Record<string, unknown> };
  const f = data.fields ?? {};
  return {
    claveActivacion: typeof f["Clave de Activación"] === "string" ? f["Clave de Activación"] : null,
    usuarioCorreo: typeof f["Usuario / Correo"] === "string" ? f["Usuario / Correo"] : null,
    contraseña: typeof f["Contraseña"] === "string" ? f["Contraseña"] : null,
  };
};

export const asignarProductoDigitalAOrden = async ({
  productoId,
  ordenRecordId,
  precioVenta,
  usadoPorNombre,
  usadoPorId,
}: {
  productoId: string;
  ordenRecordId: string;
  precioVenta?: number | null;
  usadoPorNombre?: string | null;
  usadoPorId?: string | null;
}): Promise<ProductoDigital> => {
  const client = getClient();

  // Verificar que el producto existe y está disponible.
  //
  // El guard de Estado sigue teniendo sentido después de que esta función
  // dejó de escribir "Usado" (ver abajo): ahora un producto solo llega a
  // "Usado" cuando su factura se AUTORIZA de verdad (postEmision, gancho de
  // facturación) — así que si llega aquí con "Usado" es porque ya se vendió,
  // y con "Anulado"/"Vencido" porque no es un producto vendible. El cerrojo
  // contra vincular el MISMO producto a dos órdenes a la vez es el segundo
  // guard, el de ordenReparacionId — ese es ahora el único que hace ese
  // trabajo (antes, vincularlo ya lo dejaba "Usado" y ese estado hacía de
  // doble candado; ya no).
  const productoActual = await fetchProductoDigitalById(productoId, client);
  if (!productoActual) throw new Error("Producto digital no encontrado.");
  if (["Usado", "Anulado", "Vencido"].includes(productoActual.estado)) {
    throw new Error(`No se puede asignar un producto con estado "${productoActual.estado}".`);
  }
  if (productoActual.ordenReparacionId && productoActual.ordenReparacionId !== ordenRecordId) {
    throw new Error("Este producto digital ya está vinculado a otra orden.");
  }

  const url = `${client.baseUrl}/${encodeURIComponent(AIRTABLE_TABLES.productosDigitales)}/${encodeURIComponent(productoId)}`;

  // "Estado" YA NO se toca aquí — lo pone postEmision() (lib/facturacion/
  // gancho/postEmision.ts) al autorizarse la factura de verdad, no al
  // vincular el producto a la orden. Vincular ya no es lo mismo que vender.
  const fields: Record<string, unknown> = {
    "Orden de Reparación": [ordenRecordId],
    "Tipo de Uso": "Orden de reparación",
    "Fecha de Uso / Venta": formatAirtableDateOnly(),
  };
  if (precioVenta !== undefined && precioVenta !== null) fields["Precio Venta"] = precioVenta;
  if (usadoPorNombre) fields["Usado/Vendido por"] = usadoPorNombre;
  if (usadoPorId) fields["Usuario ID Portal"] = usadoPorId;

  const res = await fetch(url, {
    method: "PATCH",
    headers: client.headers,
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { id: string; fields: Record<string, unknown> };
  return mapProductoDigitalRecord(data);
};

export const desasignarProductoDigitalDeOrden = async ({
  productoId,
  ordenRecordId,
}: {
  productoId: string;
  ordenRecordId: string;
}): Promise<ProductoDigital> => {
  const client = getClient();

  const productoActual = await fetchProductoDigitalById(productoId, client);
  if (!productoActual) throw new Error("Producto digital no encontrado.");
  if (productoActual.ordenReparacionId !== ordenRecordId) {
    throw new Error("El producto no está vinculado a esta orden.");
  }

  const url = `${client.baseUrl}/${encodeURIComponent(AIRTABLE_TABLES.productosDigitales)}/${encodeURIComponent(productoId)}`;

  const res = await fetch(url, {
    method: "PATCH",
    headers: client.headers,
    body: JSON.stringify({
      fields: {
        "Estado": "Disponible",
        "Orden de Reparación": [],
        "Tipo de Uso": null,
        "Fecha de Uso / Venta": null,
        "Usado/Vendido por": null,
        "Usuario ID Portal": null,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { id: string; fields: Record<string, unknown> };
  return mapProductoDigitalRecord(data);
};

// ─── PDF: credenciales completas + campos de auditoría ────────────────────

export interface ProductoDigitalConCredenciales extends ProductoDigital {
  claveActivacion: string | null;
  contrasena: string | null;
}

export const fetchProductoDigitalConCredenciales = async (
  recordId: string,
  client = getClient()
): Promise<ProductoDigitalConCredenciales | null> => {
  const url = `${client.baseUrl}/${encodeURIComponent(AIRTABLE_TABLES.productosDigitales)}/${encodeURIComponent(recordId)}`;
  const res = await fetch(url, { headers: client.headers, cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const data = (await res.json()) as { id: string; fields: Record<string, unknown> };
  const base = mapProductoDigitalRecord(data);
  const f = data.fields ?? {};
  return {
    ...base,
    claveActivacion: typeof f["Clave de Activación"] === "string" ? f["Clave de Activación"] : null,
    contrasena: typeof f["Contraseña"] === "string" ? f["Contraseña"] : null,
  };
};

export const saveProductoDigitalPdf = async ({
  recordId,
  filename,
  pdfBytes,
  generadoPor,
}: {
  recordId: string;
  filename: string;
  pdfBytes: Uint8Array;
  generadoPor: string;
}): Promise<void> => {
  const { token, baseId } = loadAirtableEnv();
  const client = getClient();
  const fileBase64 = Buffer.from(pdfBytes).toString("base64");

  try {
    await uploadAttachmentToRecord({
      baseId,
      authToken: token,
      recordId,
      attachmentFieldIdOrName: "Documento PDF",
      filename,
      contentType: "application/pdf",
      fileBase64,
    });
  } catch (err) {
    console.error("Error al subir PDF a Airtable:", err);
  }

  try {
    await patchRecordFields({
      tableName: AIRTABLE_TABLES.productosDigitales,
      recordId,
      fields: {
        "Documento generado por": generadoPor,
        "Fecha último PDF": new Date().toISOString(),
      },
      client,
    });
  } catch (err) {
    console.error("Error al actualizar campos de auditoría del PDF:", err);
  }
};

export const clearProductoDigitalPdf = async (recordId: string): Promise<void> => {
  const client = getClient();
  await patchRecordFields({
    tableName: AIRTABLE_TABLES.productosDigitales,
    recordId,
    fields: {
      "Documento PDF": [],
      "Documento generado por": null,
      "Fecha último PDF": null,
    },
    client,
  });
};

// ─── Catálogo Productos Digitales ─────────────────────────────────────────

export const fetchCatalogoProductosDigitales = async ({
  query,
  activoOnly = true,
  client: clientParam,
}: {
  query?: string;
  activoOnly?: boolean;
  client?: AirtableClient;
} = {}): Promise<CatalogoProductoDigital[]> => {
  const client = clientParam ?? getClient();
  const url = new URL(
    `${client.baseUrl}/${encodeURIComponent(AIRTABLE_TABLES.catalogoProductosDigitales)}`
  );
  if (activoOnly) {
    url.searchParams.set("filterByFormula", `{Activo}=1`);
  }
  url.searchParams.set("maxRecords", "200");
  url.searchParams.set("sort[0][field]", "Producto Base");
  url.searchParams.set("sort[0][direction]", "asc");

  const res = await fetch(url.toString(), { headers: client.headers, cache: "no-store" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable error ${res.status}: ${text}`);
  }
  const data = (await res.json()) as { records: { id: string; fields: Record<string, unknown> }[] };

  let results = data.records.map(mapCatalogoProductoDigitalRecord);

  if (query && query.trim()) {
    const q = query.trim().toLowerCase();
    results = results.filter(
      (c) =>
        c.productoBase.toLowerCase().includes(q) ||
        (c.marca ?? "").toLowerCase().includes(q) ||
        (c.tipo ?? "").toLowerCase().includes(q)
    );
  }

  return results;
};

export const fetchCatalogoProductoDigitalById = async (
  recordId: string,
  client = getClient()
): Promise<CatalogoProductoDigital | null> => {
  const url = `${client.baseUrl}/${encodeURIComponent(AIRTABLE_TABLES.catalogoProductosDigitales)}/${encodeURIComponent(recordId)}`;
  const res = await fetch(url, { headers: client.headers, cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const data = (await res.json()) as { id: string; fields: Record<string, unknown> };
  return mapCatalogoProductoDigitalRecord(data);
};

export interface CreateCatalogoProductoDigitalInput {
  productoBase: string;
  marca?: string | null;
  tipo?: string | null;
  portalActivacion?: string | null;
  instruccionesPdf?: string | null;
  notasParaCliente?: string | null;
  precioVentaCatalogo?: number | null;
  colorPrincipal?: string | null;
  activo?: boolean;
  logoUrl?: string | null;
}

export const createCatalogoProductoDigital = async (
  input: CreateCatalogoProductoDigitalInput,
  client = getClient()
): Promise<CatalogoProductoDigital> => {
  const url = `${client.baseUrl}/${encodeURIComponent(AIRTABLE_TABLES.catalogoProductosDigitales)}`;

  const fields: Record<string, unknown> = {
    "Producto Base": input.productoBase.trim(),
  };
  if (input.marca?.trim())            fields["Marca"]                = input.marca.trim();
  if (input.tipo?.trim())             fields["Tipo"]                 = input.tipo.trim();
  if (input.portalActivacion?.trim()) fields["Portal de Activación"] = input.portalActivacion.trim();
  if (input.instruccionesPdf?.trim()) fields["Instrucciones PDF"]    = input.instruccionesPdf.trim();
  if (input.notasParaCliente?.trim()) fields["Notas para Cliente"]   = input.notasParaCliente.trim();
  if (input.precioVentaCatalogo !== null && input.precioVentaCatalogo !== undefined) {
    fields["Precio Venta Catálogo"] = input.precioVentaCatalogo;
  }
  if (input.colorPrincipal?.trim()) fields["Color Principal"] = input.colorPrincipal.trim();
  fields["Activo"] = input.activo !== false;
  if (input.logoUrl?.trim()) fields["Logo"] = [{ url: input.logoUrl.trim() }];

  const res = await fetch(url, {
    method: "POST",
    headers: client.headers,
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { id: string; fields: Record<string, unknown> };
  return mapCatalogoProductoDigitalRecord(data);
};

export { AIRTABLE_TABLES };

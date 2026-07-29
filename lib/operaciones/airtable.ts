import type {
  OperacionListado,
  OperacionDetalle,
  OpcionDetalle,
  AbonoDetalle,
  OrdenVinculada,
  AirtableAttachment,
  CrearAbonoInput,
  CrearOperacionInput,
  ClienteBusquedaOp,
  OrdenClienteOp,
  ProveedorBusqueda,
  CrearOpcionInput,
  ShippingItemResumen,
} from "@/types/operaciones";
import { createShippingV2ItemFromOperacion } from "@/lib/shipping-v2/airtable";
import { normalizeCedula } from "@/lib/clientes/normalizeCedula";
import { calcularTotalCotizado } from "@/lib/operaciones/cobro";
import { validarOpcion } from "@/lib/operaciones/opciones";
import { elegirSiguienteIdAbono } from "@/lib/operaciones/id-abono";

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

const OPERACIONES_TABLE = "Operación Comercial";
const OPCIONES_TABLE = "Opciones";
const ABONOS_TABLE = "Abonos";
const PROVEEDORES_TABLE = "Shipping Proveedores";
const ORDENES_TABLE = "Órdenes de Reparación";
const CLIENTES_TABLE = "Clientes";
const SHIPPING_ITEMS_TABLE = "Shipping Items";

// "Total Cotizado" y "Saldo Pendiente" NO se leen de Airtable a propósito.
//
// "Total Cotizado" es un campo currency manual cuyo único escritor vivía en el
// módulo de Cotizaciones, que apunta a tablas que ya no existen en la base —
// quedó vacío en 41 de 46 operaciones. Como "Saldo Pendiente" es la fórmula
// {Total Cotizado} - {Total Abonado}, el tablero mostraba "Pagado" a
// operaciones que debían dinero y "Sin pago" a operaciones con deuda real.
//
// El total cotizado se deriva de la(s) opción(es) elegidas, que es de donde
// siempre debió salir. Se trae "Opción Elegida" para resolver sus precios.
const LIST_FIELDS = [
  "Código Operación",
  "Producto Solicitado",
  "Estado",
  "Cliente Nombre",
  "Total Abonado",
  "Opción Elegida",
  "Orden de Reparación",
];

function getClient(): AirtableClient {
  const token = process.env.AIRTABLE_API_KEY?.trim();
  const baseId = process.env.AIRTABLE_BASE_ID?.trim();
  if (!token) throw new Error("Falta AIRTABLE_API_KEY en .env.local.");
  if (!baseId) throw new Error("Falta AIRTABLE_BASE_ID en .env.local.");
  return {
    baseId,
    baseUrl: `https://api.airtable.com/v0/${baseId}`,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };
}

function tableUrl(tableName: string): string {
  const client = getClient();
  return `${client.baseUrl}/${encodeURIComponent(tableName)}`;
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

function linkedIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim() !== "");
}

function attachmentList(value: unknown): AirtableAttachment[] {
  if (!Array.isArray(value)) return [];
  const result: AirtableAttachment[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as { id?: unknown; url?: unknown; filename?: unknown; size?: unknown; type?: unknown; thumbnails?: unknown };
    const url = typeof row.url === "string" ? row.url : "";
    if (!url) continue;
    result.push({
      id: typeof row.id === "string" ? row.id : null,
      url,
      filename: typeof row.filename === "string" ? row.filename : null,
      size: typeof row.size === "number" ? row.size : null,
      type: typeof row.type === "string" ? row.type : null,
      thumbnails: row.thumbnails,
    });
  }
  return result;
}

function escapeFormula(value: string) {
  return value.replace(/'/g, "\\'");
}

function mapOperacion(
  record: AirtableRecord,
  preciosPorOpcionId: Map<string, number>
): OperacionListado {
  const f = record.fields;
  const totalCotizado = calcularTotalCotizado(linkedIds(f["Opción Elegida"]), preciosPorOpcionId);
  const totalAbonado = firstNumber(f["Total Abonado"]) ?? 0;
  return {
    id: record.id,
    codigo: firstString(f["Código Operación"], record.id),
    productoSolicitado: firstString(f["Producto Solicitado"], "Sin producto"),
    estado: firstString(f["Estado"], "Requerimiento"),
    clienteNombre: firstString(f["Cliente Nombre"], "Sin cliente"),
    totalCotizado,
    totalAbonado,
    // Derivado, no leído de la fórmula rota de Airtable. Puede ser negativo
    // (cliente con saldo a favor) — la UI decide cómo presentarlo.
    saldoPendiente: totalCotizado - totalAbonado,
    tieneOrden: linkedIds(f["Orden de Reparación"]).length > 0,
  };
}

// Precio Venta Cliente de un conjunto de opciones, en lotes para no exceder el
// límite de longitud de filterByFormula cuando el tablero crezca.
async function fetchPreciosOpciones(ids: string[]): Promise<Map<string, number>> {
  const precios = new Map<string, number>();
  const unicos = [...new Set(ids)].filter(Boolean);
  if (unicos.length === 0) return precios;

  const client = getClient();
  const LOTE = 100;

  for (let i = 0; i < unicos.length; i += LOTE) {
    const lote = unicos.slice(i, i + LOTE);
    const url = new URL(tableUrl(OPCIONES_TABLE));
    url.searchParams.set(
      "filterByFormula",
      `OR(${lote.map((id) => `RECORD_ID()='${escapeFormula(id)}'`).join(",")})`
    );
    url.searchParams.set("pageSize", "100");
    url.searchParams.append("fields[]", "Precio Venta Cliente");

    const res = await fetch(url.toString(), { headers: client.headers, cache: "no-store" });
    if (!res.ok) continue; // sin precio, la operación queda en 0 — nunca rompe el tablero
    const data = (await res.json()) as AirtableListResponse;
    for (const rec of data.records ?? []) {
      precios.set(rec.id, firstNumber(rec.fields["Precio Venta Cliente"]) ?? 0);
    }
  }

  return precios;
}

export async function fetchOperaciones(): Promise<OperacionListado[]> {
  const client = getClient();
  const base = tableUrl(OPERACIONES_TABLE);
  const records: AirtableRecord[] = [];
  let offset: string | null = null;

  do {
    const url = new URL(base);
    url.searchParams.set("pageSize", "100");
    for (const field of LIST_FIELDS) {
      url.searchParams.append("fields[]", field);
    }
    if (offset) url.searchParams.set("offset", offset);

    const res = await fetch(url.toString(), { headers: client.headers, cache: "no-store" });
    if (!res.ok) throw new Error(`Airtable error ${res.status}: ${await res.text()}`);

    const data = (await res.json()) as AirtableListResponse;
    records.push(...(data.records ?? []));
    offset = data.offset ?? null;
  } while (offset);

  const preciosPorOpcionId = await fetchPreciosOpciones(
    records.flatMap((r) => linkedIds(r.fields["Opción Elegida"]))
  );

  return records
    .sort((a, b) => (b.createdTime ?? "").localeCompare(a.createdTime ?? ""))
    .map((r) => mapOperacion(r, preciosPorOpcionId));
}

async function fetchProveedorNombres(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const client = getClient();
  const url = new URL(tableUrl(PROVEEDORES_TABLE));

  const formula =
    ids.length === 1
      ? `RECORD_ID()='${escapeFormula(ids[0])}'`
      : `OR(${ids.map((id) => `RECORD_ID()='${escapeFormula(id)}'`).join(",")})`;

  url.searchParams.set("filterByFormula", formula);
  url.searchParams.append("fields[]", "Nombre proveedor");

  const res = await fetch(url.toString(), { headers: client.headers, cache: "no-store" });
  if (!res.ok) return {};

  const data = (await res.json()) as AirtableListResponse;
  const result: Record<string, string> = {};
  for (const rec of data.records ?? []) {
    const nombre = firstString(rec.fields["Nombre proveedor"]);
    if (nombre) result[rec.id] = nombre;
  }
  return result;
}

function mapOpcion(
  record: AirtableRecord,
  proveedorNombres: Record<string, string>,
  opcionElegidaId: string | null
): OpcionDetalle {
  const f = record.fields;
  const proveedorId = linkedIds(f["Proveedor"])[0] ?? null;
  return {
    id: record.id,
    productoDescripcion: firstString(f["Producto / Descripción"]),
    proveedorId,
    proveedorNombre: proveedorId ? (proveedorNombres[proveedorId] ?? "") : "",
    tiempoEstimado: firstString(f["Tiempo Estimado"]),
    costoProveedor: firstNumber(f["Costo Proveedor"]),
    flete: firstNumber(f["Flete Estimado"]),
    arancel: firstNumber(f["Arancel / Impuestos"]),
    otrosCostos: firstNumber(f["Otros Costos"]),
    costoRealTotal: firstNumber(f["Costo Real Total"]),
    precioVentaCliente: firstNumber(f["Precio Venta Cliente"]),
    gananciaEstimada: firstNumber(f["Ganancia Estimada"]),
    urlProveedor: firstString(f["URL Proveedor"]),
    fotos: attachmentList(f["Fotos"]),
    notaParaCliente: firstString(f["Nota para Cliente"]),
    notaInterna: firstString(f["Nota Interna"]),
    estadoOpcion: firstString(f["Estado Opción"], "Disponible"),
    seleccionadaPorCliente: f["Seleccionada por Cliente"] === true,
    esElegida: opcionElegidaId !== null && record.id === opcionElegidaId,
  };
}

function mapAbono(record: AirtableRecord, aplicadoA: "operacion" | "orden"): AbonoDetalle {
  const f = record.fields;
  return {
    id: record.id,
    idAbono: firstNumber(f["ID Abono"]),
    fecha: firstString(f["Fecha de Abono"]),
    monto: firstNumber(f["Monto"]),
    metodoPago: firstString(f["Método de Pago"]),
    estadoAbono: firstString(f["Estado del Abono"], "Registrado"),
    observacion: firstString(f["Observación"]),
    clienteLabel: firstString(f["Cliente Operación"]) || firstString(f["Cliente Orden"]),
    aplicadoA,
  };
}

// Airtable does not support {multipleRecordLinks field} = 'recXXX' filters reliably.
// Always fetch child records using the inverse link IDs from the parent record,
// then retrieve them by RECORD_ID() formula.
async function fetchByIds(
  client: AirtableClient,
  tableName: string,
  ids: string[]
): Promise<AirtableRecord[]> {
  if (ids.length === 0) return [];
  const url = new URL(`${client.baseUrl}/${encodeURIComponent(tableName)}`);
  const formula =
    ids.length === 1
      ? `RECORD_ID()='${escapeFormula(ids[0])}'`
      : `OR(${ids.map((rid) => `RECORD_ID()='${escapeFormula(rid)}'`).join(",")})`;
  url.searchParams.set("filterByFormula", formula);
  url.searchParams.set("pageSize", "100");
  const res = await fetch(url.toString(), { headers: client.headers, cache: "no-store" });
  if (!res.ok) return [];
  return ((await res.json()) as AirtableListResponse).records ?? [];
}

export async function fetchOperacionDetalle(id: string): Promise<OperacionDetalle | null> {
  const client = getClient();

  // 1. Fetch the main operation record (includes inverse link arrays for Opciones and Abonos)
  const opRes = await fetch(
    `${client.baseUrl}/${encodeURIComponent(OPERACIONES_TABLE)}/${encodeURIComponent(id)}`,
    { headers: client.headers, cache: "no-store" }
  );

  if (!opRes.ok) {
    if (opRes.status === 404) return null;
    throw new Error(`Airtable error ${opRes.status}: ${await opRes.text()}`);
  }

  const opRecord = (await opRes.json()) as AirtableRecord;
  const f = opRecord.fields;

  const opcionElegidaId = linkedIds(f["Opción Elegida"])[0] ?? null;
  const ordenId = linkedIds(f["Orden de Reparación"])[0] ?? null;
  // Use the inverse link arrays already on the operation record
  const opcionIds = linkedIds(f["Opciones"]);
  const abonosOpIds = linkedIds(f["Abonos"]);
  // Inverse of "Operación Comercial" field in Shipping Items
  const articuloFisicoIds = linkedIds(f["Artículo físico"]);

  // 2. Fetch orden, opciones, op abonos and Shipping Item summary in parallel
  const fetchOrden = async (): Promise<{ ordenVinculada: OrdenVinculada | null; ordenRecord: AirtableRecord | null }> => {
    if (!ordenId) return { ordenVinculada: null, ordenRecord: null };
    const url = new URL(
      `${client.baseUrl}/${encodeURIComponent(ORDENES_TABLE)}/${encodeURIComponent(ordenId)}`
    );
    // "Abonos (Operación)" is the inverse link from Abonos.Aplicado a: Orden
    url.searchParams.append("fields[]", "ID");
    url.searchParams.append("fields[]", "Abonos (Operación)");
    const res = await fetch(url.toString(), { headers: client.headers, cache: "no-store" });
    if (!res.ok) return { ordenVinculada: { id: ordenId, codigoOrden: ordenId }, ordenRecord: null };
    const rec = (await res.json()) as AirtableRecord;
    return {
      ordenVinculada: { id: ordenId, codigoOrden: firstString(rec.fields?.["ID"], ordenId) },
      ordenRecord: rec,
    };
  };

  // "Artículo físico" es un link MÚLTIPLE: una operación puede haber generado
  // varios artículos. Antes solo se leía el primero (`[0]`) y el resto era
  // invisible en la pantalla, aunque la cuenta unificada sí los sumaba todos —
  // la operación mostraba un artículo y cobraba por varios.
  const fetchArticulosFisicos = async (): Promise<ShippingItemResumen[]> => {
    if (articuloFisicoIds.length === 0) return [];
    const records = await fetchByIds(client, SHIPPING_ITEMS_TABLE, articuloFisicoIds);
    return records.map((rec) => ({
      id: rec.id,
      nombre: firstString(rec.fields["Nombre del item"]),
      estadoItem: firstString(rec.fields["Estado Item"], "Registrado"),
    }));
  };

  const [opcionesRecords, abonosOpRecords, { ordenVinculada, ordenRecord }, articulosFisicos] =
    await Promise.all([
      fetchByIds(client, OPCIONES_TABLE, opcionIds),
      fetchByIds(client, ABONOS_TABLE, abonosOpIds),
      fetchOrden(),
      fetchArticulosFisicos(),
    ]);

  // 3. Fetch abonos linked to the order, if any
  const abonosOrdenIds = ordenRecord ? linkedIds(ordenRecord.fields["Abonos (Operación)"]) : [];
  const abonosOrdenRecords = await fetchByIds(client, ABONOS_TABLE, abonosOrdenIds);

  // 4. Batch-fetch provider names for all opciones
  const proveedorIds = [
    ...new Set(opcionesRecords.flatMap((r) => linkedIds(r.fields["Proveedor"]))),
  ];
  const proveedorNombres = await fetchProveedorNombres(proveedorIds);

  // 5. Map
  const opciones = opcionesRecords.map((r) => mapOpcion(r, proveedorNombres, opcionElegidaId));

  // El total cotizado sale de la(s) opción(es) elegidas, ya mapeadas arriba —
  // no hace falta ir a Airtable de nuevo.
  const totalCotizado = opciones
    .filter((o) => o.esElegida)
    .reduce((sum, o) => sum + (o.precioVentaCliente ?? 0), 0);
  const totalAbonado = firstNumber(f["Total Abonado"]) ?? 0;

  // Mismo dedupe que getCuentaUnificada: un abono con ambos links ("Aplicado
  // a: Orden" + "Aplicado a: Operación") venía por las dos vías y se
  // renderizaba duplicado en el detalle de la operación. Gana el mapeo
  // "operacion" porque es la pantalla desde la que se está mirando.
  const abonosPorId = new Map<string, AbonoDetalle>();
  for (const r of abonosOpRecords) abonosPorId.set(r.id, mapAbono(r, "operacion"));
  for (const r of abonosOrdenRecords) {
    if (!abonosPorId.has(r.id)) abonosPorId.set(r.id, mapAbono(r, "orden"));
  }
  const abonos = [...abonosPorId.values()].sort((a, b) =>
    (a.fecha ?? "").localeCompare(b.fecha ?? "")
  );

  return {
    id: opRecord.id,
    codigo: firstString(f["Código Operación"], opRecord.id),
    productoSolicitado: firstString(f["Producto Solicitado"]),
    descripcionRequerimiento: firstString(f["Descripción del Requerimiento"]),
    estado: firstString(f["Estado"], "Requerimiento"),
    clienteId: linkedIds(f["Cliente"])[0] ?? null,
    clienteNombre: firstString(f["Cliente Nombre"]),
    clienteTelefono: firstString(f["Cliente Teléfono"]),
    clienteCorreo: firstString(f["Cliente Correo"]),
    clienteCedula: firstString(f["Cliente Cédula"]),
    categoria: firstString(f["Categoría"]),
    requiereInstalacion: f["Requiere Instalación"] === true,
    equipoEnTienda: f["Equipo ya está en tienda"] === true,
    // Derivados de la opción elegida, no leídos de "Total Cotizado" /
    // "Saldo Pendiente" de Airtable (ver comentario en LIST_FIELDS).
    totalCotizado,
    totalAbonado,
    saldoPendiente: totalCotizado - totalAbonado,
    codigoPedido: firstString(f["Código Pedido"]),
    estadoInstalacion: firstString(f["Estado Instalación"]),
    observacionInterna: firstString(f["Observación Interna"]),
    opcionElegidaId,
    articulosFisicos,
    ordenVinculada,
    opciones,
    abonos,
  };
}

// ── Write operations ─────────────────────────────────────────────────────────

// Exported so other modules that write to the same "Abonos" table (e.g. técnicos)
// can share this single generator and avoid ID collisions between modules.
export async function getMaxIdAbono(): Promise<number> {
  const client = getClient();
  const url = new URL(`${client.baseUrl}/${encodeURIComponent(ABONOS_TABLE)}`);
  url.searchParams.set("pageSize", "1");
  url.searchParams.set("sort[0][field]", "ID Abono");
  url.searchParams.set("sort[0][direction]", "desc");
  url.searchParams.append("fields[]", "ID Abono");
  const res = await fetch(url.toString(), { headers: client.headers, cache: "no-store" });
  if (!res.ok) return 0;
  const data = (await res.json()) as AirtableListResponse;
  return firstNumber(data.records?.[0]?.fields?.["ID Abono"]) ?? 0;
}

/**
 * Siguiente "ID Abono" libre.
 *
 * Antes cada módulo hacía `getMaxIdAbono() + 1` por su cuenta. Como técnicos,
 * operaciones y facturación escriben en la MISMA tabla, dos cobros a la vez
 * podían leer el mismo máximo y quedarse con el mismo número — sin que nada lo
 * detectara. Aquí se lee la cola de números altos y se salta lo ocupado.
 *
 * No es un bloqueo real (Airtable no lo ofrece), pero cierra la ventana de la
 * práctica: dos personas cobrando en el mismo segundo.
 */
export async function reservarSiguienteIdAbono(): Promise<number> {
  const client = getClient();
  const url = new URL(`${client.baseUrl}/${encodeURIComponent(ABONOS_TABLE)}`);
  url.searchParams.set("pageSize", "20");
  url.searchParams.set("sort[0][field]", "ID Abono");
  url.searchParams.set("sort[0][direction]", "desc");
  url.searchParams.append("fields[]", "ID Abono");

  const res = await fetch(url.toString(), { headers: client.headers, cache: "no-store" });
  if (!res.ok) return (await getMaxIdAbono()) + 1;

  const data = (await res.json()) as AirtableListResponse;
  const ocupados = (data.records ?? [])
    .map((r) => firstNumber(r.fields?.["ID Abono"]))
    .filter((n): n is number => n !== null);

  return elegirSiguienteIdAbono(ocupados[0] ?? 0, ocupados);
}

export async function crearAbono(input: CrearAbonoInput): Promise<{ id: string; idAbono: number }> {
  const client = getClient();

  // Número libre verificado contra los ya ocupados (ver reservarSiguienteIdAbono).
  const idAbono = await reservarSiguienteIdAbono();

  const fields: Record<string, unknown> = {
    "ID Abono": idAbono,
    "Monto": input.monto,
    "Método de Pago": input.metodoPago,
    "Fecha de Abono": input.fechaAbono,
    "Estado del Abono": "Registrado",
    "Registrado Por": input.registradoPor,
    "Aplicado a: Operación": [input.operacionId],
  };

  if (input.ordenId) fields["Aplicado a: Orden"] = [input.ordenId];
  if (input.numeroTransaccion?.trim()) fields["Número de Transacción"] = input.numeroTransaccion.trim();
  if (input.observacion?.trim()) fields["Observación"] = input.observacion.trim();

  const res = await fetch(`${client.baseUrl}/${encodeURIComponent(ABONOS_TABLE)}`, {
    method: "POST",
    headers: client.headers,
    body: JSON.stringify({ fields }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Airtable error ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as AirtableRecord;
  return { id: data.id, idAbono };
}

async function uploadAttachmentToField(
  recordId: string,
  fieldName: string,
  filename: string,
  contentType: string,
  fileBase64: string
): Promise<void> {
  const token = process.env.AIRTABLE_API_KEY?.trim();
  const baseId = process.env.AIRTABLE_BASE_ID?.trim();
  if (!token || !baseId) throw new Error("Credenciales Airtable no configuradas.");
  const url = `https://content.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(recordId)}/${encodeURIComponent(fieldName)}/uploadAttachment`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ contentType, filename, file: fileBase64 }),
  });
  if (!res.ok) throw new Error(`Airtable content error ${res.status}: ${await res.text()}`);
}

export async function uploadComprobanteAbono(
  recordId: string, filename: string, contentType: string, fileBase64: string
): Promise<void> {
  return uploadAttachmentToField(recordId, "Comprobante", filename, contentType, fileBase64);
}

export async function uploadFotoOpcion(
  recordId: string, filename: string, contentType: string, fileBase64: string
): Promise<void> {
  return uploadAttachmentToField(recordId, "Fotos", filename, contentType, fileBase64);
}

// ── Clientes search (same base/token as operaciones) ─────────────────────────

function escapeSearch(s: string): string {
  return s.replace(/"/g, '\\"');
}

export async function buscarClientesOp(q: string): Promise<ClienteBusquedaOp[]> {
  if (!q.trim()) return [];
  const client = getClient();
  const normalizedQ = q.trim().toLowerCase();
  const escaped = escapeSearch(escapeFormula(normalizedQ));
  const formula = `OR(SEARCH("${escaped}",LOWER({Nombre}&""))>0,SEARCH("${escaped}",LOWER({Cédula}&""))>0)`;

  const url = new URL(`${client.baseUrl}/${encodeURIComponent(CLIENTES_TABLE)}`);
  url.searchParams.set("filterByFormula", formula);
  url.searchParams.set("pageSize", "10");
  ["Nombre", "Cédula", "Teléfono", "Correo"].forEach((f) => url.searchParams.append("fields[]", f));

  const res = await fetch(url.toString(), { headers: client.headers, cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as AirtableListResponse;
  return (data.records ?? []).map((r) => ({
    id: r.id,
    nombre: firstString(r.fields["Nombre"], "Sin nombre"),
    cedula: firstString(r.fields["Cédula"]),
    telefono: firstString(r.fields["Teléfono"]),
    correo: firstString(r.fields["Correo"]),
  }));
}

export class CedulaEnUsoError extends Error {
  clienteExistente: ClienteBusquedaOp | null;
  constructor(
    clienteExistente: ClienteBusquedaOp | null = null,
    message = "Ya existe un cliente registrado con esta cédula."
  ) {
    super(message);
    this.name = "CedulaEnUsoError";
    this.clienteExistente = clienteExistente;
  }
}

// Fail-closed: si la consulta de verificación falla, lanza en vez de asumir
// que no hay duplicado (mejor bloquear la creación que arriesgar un cliente
// duplicado con historial partido entre Órdenes y Operaciones).
async function buscarClientePorCedulaNormalizada(
  normalizedCedula: string
): Promise<ClienteBusquedaOp | null> {
  const client = getClient();
  const url = new URL(`${client.baseUrl}/${encodeURIComponent(CLIENTES_TABLE)}`);
  // "Cédula" es un campo de texto — seguro de filtrar directamente (no es un link).
  url.searchParams.set(
    "filterByFormula",
    `LOWER(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE({Cédula}&""," ",""),"-",""),".","")) = "${normalizedCedula}"`
  );
  url.searchParams.set("pageSize", "1");
  ["Nombre", "Cédula", "Teléfono", "Correo"].forEach((f) => url.searchParams.append("fields[]", f));

  const res = await fetch(url.toString(), { headers: client.headers, cache: "no-store" });
  if (!res.ok) {
    throw new Error(`No se pudo verificar cédulas duplicadas (Airtable error ${res.status}).`);
  }
  const data = (await res.json()) as AirtableListResponse;
  const rec = data.records?.[0];
  if (!rec) return null;
  return {
    id: rec.id,
    nombre: firstString(rec.fields["Nombre"], "Sin nombre"),
    cedula: firstString(rec.fields["Cédula"]),
    telefono: firstString(rec.fields["Teléfono"]),
    correo: firstString(rec.fields["Correo"]),
  };
}

export async function crearClienteOp(input: {
  nombre: string;
  cedula?: string;
  telefono?: string;
  correo?: string;
}): Promise<ClienteBusquedaOp> {
  const client = getClient();
  const nombre = input.nombre.trim();
  if (!nombre) throw new Error("El nombre del cliente es obligatorio.");

  const normalizedCedula = input.cedula?.trim() ? normalizeCedula(input.cedula) : "";
  if (normalizedCedula) {
    const existente = await buscarClientePorCedulaNormalizada(normalizedCedula);
    if (existente) {
      throw new CedulaEnUsoError(existente);
    }
  }

  const fields: Record<string, unknown> = { Nombre: nombre };
  if (input.cedula?.trim()) fields["Cédula"] = input.cedula.trim();
  if (input.telefono?.trim()) fields["Teléfono"] = input.telefono.trim();
  if (input.correo?.trim()) fields["Correo"] = input.correo.trim();

  const today = new Date();
  fields["Fecha de registro"] = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const res = await fetch(`${client.baseUrl}/${encodeURIComponent(CLIENTES_TABLE)}`, {
    method: "POST",
    headers: client.headers,
    body: JSON.stringify({ fields }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Airtable error ${res.status}: ${await res.text()}`);
  const record = (await res.json()) as AirtableRecord;
  return {
    id: record.id,
    nombre: firstString(record.fields["Nombre"], nombre),
    cedula: firstString(record.fields["Cédula"]),
    telefono: firstString(record.fields["Teléfono"]),
    correo: firstString(record.fields["Correo"]),
  };
}

// ── Órdenes por cliente ───────────────────────────────────────────────────────

export async function fetchOrdenesDeCliente(clienteId: string): Promise<OrdenClienteOp[]> {
  const client = getClient();

  // Fetch the full client record without a fields[] filter — adding fields[] via
  // template literals silently corrupts the query (accented chars + spaces are not
  // percent-encoded), causing Airtable to return the record without the field.
  // Reading the full record is safe and guarantees the inverse link is present.
  const clienteRes = await fetch(
    `${client.baseUrl}/${encodeURIComponent(CLIENTES_TABLE)}/${encodeURIComponent(clienteId)}`,
    { headers: client.headers, cache: "no-store" }
  );

  if (!clienteRes.ok) return [];

  const rec = (await clienteRes.json()) as AirtableRecord;
  // "Órdenes Relacionadas" is the inverse link from Órdenes de Reparación.Cliente
  const ordenIds = linkedIds(rec.fields["Órdenes Relacionadas"]);

  if (ordenIds.length === 0) return [];

  // Use RECORD_ID() formula via fetchByIds — never filter by linked field value
  // directly (known Airtable bug: always returns 0 results for multipleRecordLinks).
  const records = await fetchByIds(client, ORDENES_TABLE, ordenIds.slice(0, 50));
  return records
    .map(mapOrdenClienteOp)
    .sort((a, b) => b.fechaIngreso.localeCompare(a.fechaIngreso));
}

function mapOrdenClienteOp(r: AirtableRecord): OrdenClienteOp {
  return {
    id: r.id,
    codigoOrden: firstString(r.fields["ID"], r.id),
    equipo: firstString(r.fields["Equipo"], "Sin equipo"),
    estado: firstString(r.fields["Estado Actual"], ""),
    fechaIngreso: firstString(r.fields["Fecha de Ingreso"]),
  };
}

// ── Categorías ────────────────────────────────────────────────────────────────

export async function fetchCategorias(): Promise<string[]> {
  const client = getClient();
  const url = new URL(`${client.baseUrl}/${encodeURIComponent(OPERACIONES_TABLE)}`);
  url.searchParams.set("pageSize", "100");
  url.searchParams.append("fields[]", "Categoría");

  const res = await fetch(url.toString(), { headers: client.headers, cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as AirtableListResponse;
  const seen = new Set<string>();
  for (const r of data.records ?? []) {
    const v = firstString(r.fields["Categoría"]);
    if (v) seen.add(v);
  }
  return Array.from(seen).sort();
}

// ── Crear / editar operación ──────────────────────────────────────────────────

export async function crearOperacion(input: CrearOperacionInput): Promise<{ id: string }> {
  const client = getClient();

  const fields: Record<string, unknown> = {
    "Cliente": [input.clienteId],
    "Producto Solicitado": input.productoSolicitado.trim(),
    "Estado": "Requerimiento",
  };

  if (input.categoria?.trim()) fields["Categoría"] = input.categoria.trim();
  if (input.descripcionRequerimiento?.trim()) fields["Descripción del Requerimiento"] = input.descripcionRequerimiento.trim();
  if (input.requiereInstalacion) fields["Requiere Instalación"] = true;
  if (input.equipoEnTienda) fields["Equipo ya está en tienda"] = true;
  if (input.ordenId) fields["Orden de Reparación"] = [input.ordenId];

  const res = await fetch(`${client.baseUrl}/${encodeURIComponent(OPERACIONES_TABLE)}`, {
    method: "POST",
    headers: client.headers,
    body: JSON.stringify({ fields }),
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`Airtable error ${res.status}: ${await res.text()}`);
  const record = (await res.json()) as AirtableRecord;
  return { id: record.id };
}

export async function updateOperacionOrden(
  operacionId: string,
  ordenId: string | null
): Promise<void> {
  const client = getClient();
  const fields: Record<string, unknown> = {
    "Orden de Reparación": ordenId ? [ordenId] : [],
  };

  const res = await fetch(
    `${client.baseUrl}/${encodeURIComponent(OPERACIONES_TABLE)}/${encodeURIComponent(operacionId)}`,
    {
      method: "PATCH",
      headers: client.headers,
      body: JSON.stringify({ fields }),
      cache: "no-store",
    }
  );

  if (!res.ok) throw new Error(`Airtable error ${res.status}: ${await res.text()}`);
}

// ── Cédula duplicate check ────────────────────────────────────────────────────

// ── Proveedores search ────────────────────────────────────────────────────────

export async function buscarProveedoresOp(q: string): Promise<ProveedorBusqueda[]> {
  if (!q.trim()) return [];
  const client = getClient();
  const escaped = escapeSearch(escapeFormula(q.trim().toLowerCase()));
  const formula = `SEARCH("${escaped}", LOWER({Nombre proveedor}&"")) > 0`;
  const url = new URL(`${client.baseUrl}/${encodeURIComponent(PROVEEDORES_TABLE)}`);
  url.searchParams.set("filterByFormula", formula);
  url.searchParams.set("pageSize", "10");
  url.searchParams.append("fields[]", "Nombre proveedor");

  const res = await fetch(url.toString(), { headers: client.headers, cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as AirtableListResponse;
  return (data.records ?? []).map((r) => ({
    id: r.id,
    nombre: firstString(r.fields["Nombre proveedor"], "Sin nombre"),
  }));
}

// ── Tiempos estimados ─────────────────────────────────────────────────────────

export async function fetchTiemposEstimados(): Promise<string[]> {
  const client = getClient();
  const url = new URL(`${client.baseUrl}/${encodeURIComponent(OPCIONES_TABLE)}`);
  url.searchParams.set("pageSize", "100");
  url.searchParams.append("fields[]", "Tiempo Estimado");

  const res = await fetch(url.toString(), { headers: client.headers, cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as AirtableListResponse;
  const seen = new Set<string>();
  for (const r of data.records ?? []) {
    const v = firstString(r.fields["Tiempo Estimado"]);
    if (v) seen.add(v);
  }
  return Array.from(seen).sort();
}

// ── Opciones CRUD ─────────────────────────────────────────────────────────────

export async function crearOpcion(
  operacionId: string,
  input: CrearOpcionInput
): Promise<{ id: string }> {
  const client = getClient();

  // Antes no se validaba nada: en producción quedó una opción llamada
  // "NO ELEGIBLE (ELIMINAR)" y otra sin precio. Y como el Total Cotizado de la
  // operación sale de la opción elegida, una opción sin precio hace que el
  // tablero diga "Sin cotizar" aunque ya se le pasó propuesta al cliente.
  const error = validarOpcion(input);
  if (error) throw new Error(error);

  const fields: Record<string, unknown> = {
    "Producto / Descripción": input.productoDescripcion.trim(),
    "Operación": [operacionId],
  };
  if (input.proveedorId) fields["Proveedor"] = [input.proveedorId];
  if (input.tiempoEstimado?.trim()) fields["Tiempo Estimado"] = input.tiempoEstimado.trim();
  if (input.costoProveedor != null) fields["Costo Proveedor"] = input.costoProveedor;
  if (input.precioVentaCliente != null) fields["Precio Venta Cliente"] = input.precioVentaCliente;
  if (input.urlProveedor?.trim()) fields["URL Proveedor"] = input.urlProveedor.trim();
  if (input.notaParaCliente?.trim()) fields["Nota para Cliente"] = input.notaParaCliente.trim();
  if (input.notaInterna?.trim()) fields["Nota Interna"] = input.notaInterna.trim();

  const res = await fetch(`${client.baseUrl}/${encodeURIComponent(OPCIONES_TABLE)}`, {
    method: "POST",
    headers: client.headers,
    body: JSON.stringify({ fields }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Airtable error ${res.status}: ${await res.text()}`);
  const record = (await res.json()) as AirtableRecord;
  return { id: record.id };
}

/** Lee solo lo que hace falta para validar una edición parcial de opción. */
async function fetchOpcionParaValidar(opcionId: string): Promise<{
  productoDescripcion: string;
  precioVentaCliente: number | null;
  costoProveedor: number | null;
}> {
  const client = getClient();
  const res = await fetch(
    `${client.baseUrl}/${encodeURIComponent(OPCIONES_TABLE)}/${encodeURIComponent(opcionId)}`,
    { headers: client.headers, cache: "no-store" }
  );
  if (!res.ok) throw new Error(`Airtable error ${res.status} leyendo la opción`);
  const rec = (await res.json()) as AirtableRecord;
  return {
    productoDescripcion: firstString(rec.fields["Producto / Descripción"]),
    precioVentaCliente: firstNumber(rec.fields["Precio Venta Cliente"]),
    costoProveedor: firstNumber(rec.fields["Costo Proveedor"]),
  };
}

export async function actualizarOpcion(
  opcionId: string,
  input: Partial<CrearOpcionInput>
): Promise<void> {
  const client = getClient();

  // Es una edición parcial: solo se valida lo que viene en el payload, para no
  // exigir el precio a quien solo está corrigiendo una nota.
  if (input.productoDescripcion !== undefined || input.precioVentaCliente !== undefined || input.costoProveedor !== undefined) {
    const actual = await fetchOpcionParaValidar(opcionId);
    const error = validarOpcion({
      productoDescripcion: input.productoDescripcion ?? actual.productoDescripcion,
      precioVentaCliente: input.precioVentaCliente !== undefined ? input.precioVentaCliente : actual.precioVentaCliente,
      costoProveedor: input.costoProveedor !== undefined ? input.costoProveedor : actual.costoProveedor,
    });
    if (error) throw new Error(error);
  }

  const fields: Record<string, unknown> = {};
  if (input.productoDescripcion != null) fields["Producto / Descripción"] = input.productoDescripcion.trim();
  if (input.proveedorId !== undefined) fields["Proveedor"] = input.proveedorId ? [input.proveedorId] : [];
  if (input.tiempoEstimado !== undefined) fields["Tiempo Estimado"] = input.tiempoEstimado?.trim() ?? "";
  if (input.costoProveedor !== undefined) fields["Costo Proveedor"] = input.costoProveedor ?? null;
  if (input.precioVentaCliente !== undefined) fields["Precio Venta Cliente"] = input.precioVentaCliente ?? null;
  if (input.urlProveedor !== undefined) fields["URL Proveedor"] = input.urlProveedor?.trim() ?? "";
  if (input.notaParaCliente !== undefined) fields["Nota para Cliente"] = input.notaParaCliente?.trim() ?? "";
  if (input.notaInterna !== undefined) fields["Nota Interna"] = input.notaInterna?.trim() ?? "";

  const res = await fetch(
    `${client.baseUrl}/${encodeURIComponent(OPCIONES_TABLE)}/${encodeURIComponent(opcionId)}`,
    {
      method: "PATCH",
      headers: client.headers,
      body: JSON.stringify({ fields }),
      cache: "no-store",
    }
  );
  if (!res.ok) throw new Error(`Airtable error ${res.status}: ${await res.text()}`);
}

export async function setOpcionElegida(
  operacionId: string,
  opcionId: string | null
): Promise<void> {
  const client = getClient();
  const fields = { "Opción Elegida": opcionId ? [opcionId] : [] };
  const res = await fetch(
    `${client.baseUrl}/${encodeURIComponent(OPERACIONES_TABLE)}/${encodeURIComponent(operacionId)}`,
    {
      method: "PATCH",
      headers: client.headers,
      body: JSON.stringify({ fields }),
      cache: "no-store",
    }
  );
  if (!res.ok) throw new Error(`Airtable error ${res.status}: ${await res.text()}`);
}

// ── Delete / anular operación ─────────────────────────────────────────────────

async function deleteRecord(client: AirtableClient, tableName: string, recordId: string): Promise<void> {
  const res = await fetch(
    `${client.baseUrl}/${encodeURIComponent(tableName)}/${encodeURIComponent(recordId)}`,
    { method: "DELETE", headers: client.headers, cache: "no-store" }
  );
  if (!res.ok) throw new Error(`Airtable delete error ${res.status}: ${await res.text()}`);
}

export async function eliminarOperacionConOpciones(operacionId: string): Promise<void> {
  const client = getClient();

  // Fetch the operation to get linked opciones and abonos arrays
  const opRes = await fetch(
    `${client.baseUrl}/${encodeURIComponent(OPERACIONES_TABLE)}/${encodeURIComponent(operacionId)}`,
    { headers: client.headers, cache: "no-store" }
  );
  if (!opRes.ok) throw new Error(`No se pudo cargar la operación: ${opRes.status}`);
  const opRecord = (await opRes.json()) as AirtableRecord;

  const abonosIds = linkedIds(opRecord.fields["Abonos"]);
  if (abonosIds.length > 0) {
    throw new Error("No se puede eliminar una operación que tiene abonos registrados.");
  }

  // Delete linked opciones first (orphaned options have no value)
  const opcionIds = linkedIds(opRecord.fields["Opciones"]);
  for (const id of opcionIds) {
    await deleteRecord(client, OPCIONES_TABLE, id);
  }

  // Delete the operation record
  await deleteRecord(client, OPERACIONES_TABLE, operacionId);
}

export async function anularOperacion(operacionId: string): Promise<void> {
  await actualizarEstadoOperacion(operacionId, "Rechazado");
}

export type CrearShippingItemResult =
  | { created: true; id: string; nombre: string }
  | { created: false; existingId: string };

export async function crearShippingItemDesdeOpcion(
  operacionId: string,
  opcionId: string,
  registradoPor: string
): Promise<CrearShippingItemResult> {
  const client = getClient();

  // ── Anti-duplicate: read inverse link "Artículo físico" from the operation record ──
  const opRes = await fetch(
    `${client.baseUrl}/${encodeURIComponent(OPERACIONES_TABLE)}/${encodeURIComponent(operacionId)}`,
    { headers: client.headers, cache: "no-store" }
  );
  if (!opRes.ok) throw new Error(`Airtable error leyendo operación ${opRes.status}`);
  const opRec = (await opRes.json()) as AirtableRecord;
  const existingItemIds = linkedIds(opRec.fields["Artículo físico"]);
  if (existingItemIds.length > 0) {
    return { created: false, existingId: existingItemIds[0] };
  }

  // ── Fetch opcion record for field values ──
  const opcionRes = await fetch(
    `${client.baseUrl}/${encodeURIComponent(OPCIONES_TABLE)}/${encodeURIComponent(opcionId)}`,
    { headers: client.headers, cache: "no-store" }
  );
  if (!opcionRes.ok) throw new Error(`Airtable error leyendo opción ${opcionRes.status}`);
  const opcionRec = (await opcionRes.json()) as AirtableRecord;
  const of = opcionRec.fields;

  const nombre = firstString(of["Producto / Descripción"]) || "Artículo sin nombre";
  const costoProveedor = firstNumber(of["Costo Proveedor"]);
  const precioVenta = firstNumber(of["Precio Venta Cliente"]);
  const proveedorIds = linkedIds(of["Proveedor"]);
  const fotos = attachmentList(of["Fotos"]).map((foto) => ({
    url: foto.url,
    filename: foto.filename ?? undefined,
    type: foto.type ?? undefined,
  }));

  const item = await createShippingV2ItemFromOperacion(
    {
      operacionId,
      opcionId,
      nombre,
      descripcion: nombre,
      // La operación ya sabe qué es (Laptop, Batería, SSD…) y Shipping Items
      // usa exactamente la misma lista. El dato correcto siempre estuvo aquí
      // al lado; antes se ignoraba y se forzaba "Repuesto" a todo.
      categoria: firstString(opRec.fields["Categoría"]) || null,
      proveedorId: proveedorIds[0] ?? null,
      costoProveedor,
      precioVenta,
      fotos,
    },
    { registradoPor }
  );

  return { created: true, id: item.id, nombre: item.nombre || nombre };
}

export async function actualizarEstadoOperacion(
  operacionId: string,
  estado: string
): Promise<void> {
  const client = getClient();
  const res = await fetch(
    `${client.baseUrl}/${encodeURIComponent(OPERACIONES_TABLE)}/${encodeURIComponent(operacionId)}`,
    {
      method: "PATCH",
      headers: client.headers,
      body: JSON.stringify({ fields: { Estado: estado } }),
      cache: "no-store",
    }
  );
  if (!res.ok) throw new Error(`Airtable error ${res.status}: ${await res.text()}`);
}

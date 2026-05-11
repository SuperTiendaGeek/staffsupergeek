import {
  ESTADOS_COTIZACION,
  type CotizacionDetalle,
  type CotizacionListado,
  type CotizacionResumenEstado,
  type CrearAbonoCotizacionInput,
  type CrearCotizacionInput,
  type CrearOpcionCotizacionInput,
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
  baseUrl: string;
  headers: HeadersInit;
};

export const COTIZACIONES_TABLES = {
  cotizaciones: process.env.AIRTABLE_COTIZACIONES_TABLE?.trim() || "Cotizaciones",
  opciones:
    process.env.AIRTABLE_OPCIONES_COTIZACION_TABLE?.trim() || "Opciones de Cotización",
  abonos: process.env.AIRTABLE_ABONOS_COTIZACION_TABLE?.trim() || "Abonos de Cotización",
  item: process.env.AIRTABLE_ITEM_TABLE?.trim() || "Item",
  proveedores: process.env.AIRTABLE_PROVEEDORES_TABLE?.trim() || "Proveedores",
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
    baseUrl: `https://api.airtable.com/v0/${baseId}`,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };
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
    itemPedidoId: firstString(fields["Item Pedido ID"]),
  };
}

function mapOpcion(record: AirtableRecord): OpcionCotizacion {
  const fields = record.fields;
  return {
    id: record.id,
    opcion: firstString(fields["Opción"], record.id),
    nombre: firstString(fields["Nombre Opción"], "Opción sin nombre"),
    descripcion: firstString(fields["Descripción"]),
    fotos: attachmentList(fields["Fotos"]),
    proveedor: firstString(fields["Proveedor"]),
    proveedorRecordIds: linkedIds(fields["Proveedor"]),
    urlProveedor: firstString(fields["URL Proveedor"]),
    costoProveedor: firstNumber(fields["Costo Proveedor"]),
    fleteEstimado: firstNumber(fields["Flete Estimado"]),
    arancelImpuestos: firstNumber(fields["Arancel / Impuestos"]),
    otrosCostos: firstNumber(fields["Otros Costos"]),
    costoRealTotal: firstNumber(fields["Costo Real Total"]),
    precioVentaCliente: firstNumber(fields["Precio Venta Cliente"]),
    gananciaEstimada: firstNumber(fields["Ganancia Estimada"]),
    estado: firstString(fields["Estado Opción"], "Disponible"),
    seleccionadaPorCliente: boolValue(fields["Seleccionada por Cliente"]),
    notaInterna: firstString(fields["Nota Interna"]),
    notaParaCliente: firstString(fields["Nota para Cliente"]),
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
    pageUrl.searchParams.append("sort[0][field]", "Fecha Creación");
    pageUrl.searchParams.append("sort[0][direction]", "desc");
    if (offset) pageUrl.searchParams.set("offset", offset);
    if (formulas.length === 1) pageUrl.searchParams.set("filterByFormula", formulas[0]);
    if (formulas.length > 1) pageUrl.searchParams.set("filterByFormula", `AND(${formulas.join(",")})`);

    const data = await airtableRequest<AirtableListResponse>(pageUrl.toString(), {
      headers: client.headers,
    });
    records.push(...(data.records ?? []));
    offset = data.offset ?? null;
  } while (offset);

  return records.map(mapCotizacion);
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
  const [opciones, abonos] = await Promise.all([
    fetchOpcionesCotizacion(id, codigo),
    fetchAbonosCotizacion(id, codigo),
  ]);
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

  return (data.records ?? []).map(mapOpcion);
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

  const { client, url } = airtableUrl(COTIZACIONES_TABLES.opciones);
  const fields: Record<string, unknown> = {
    "Cotización": [input.cotizacionId],
    "Nombre Opción": input.nombre,
    "Proveedor": [input.proveedorId],
    "Estado Opción": "Disponible",
    "Seleccionada por Cliente": false,
  };

  if (input.descripcion) fields["Descripción"] = input.descripcion;
  if (input.urlProveedor) fields["URL Proveedor"] = input.urlProveedor;
  if (input.costoProveedor !== null && input.costoProveedor !== undefined) {
    fields["Costo Proveedor"] = input.costoProveedor;
  }
  if (input.otrosCostos !== null && input.otrosCostos !== undefined) {
    fields["Otros Costos"] = input.otrosCostos;
  }
  if (input.precioVentaCliente !== null && input.precioVentaCliente !== undefined) {
    fields["Precio Venta Cliente"] = input.precioVentaCliente;
  }
  if (input.notaInterna) fields["Nota Interna"] = input.notaInterna;
  if (input.notaParaCliente) fields["Nota para Cliente"] = input.notaParaCliente;

  const data = await airtableRequest<AirtableRecord>(url, {
    method: "POST",
    headers: client.headers,
    body: JSON.stringify({ fields }),
  });

  return mapOpcion(data);
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

export async function seleccionarOpcionCotizacion(cotizacionId: string, opcionId: string) {
  const cotizacion = await fetchCotizacionRecord(cotizacionId);
  const codigo = cotizacion ? firstString(cotizacion.fields["Código Cotización"], cotizacion.id) : "";
  const opciones = await fetchOpcionesCotizacion(cotizacionId, codigo);

  await Promise.all(
    opciones
      .filter((opcion) => opcion.id !== opcionId && opcion.seleccionadaPorCliente)
      .map((opcion) =>
        patchOpcion(opcion.id, {
          "Seleccionada por Cliente": false,
          "Estado Opción": "Disponible",
        })
      )
  );

  const selected = await patchOpcion(opcionId, {
    "Seleccionada por Cliente": true,
    "Estado Opción": "Seleccionada",
  });

  const totalAbonado = firstNumber(cotizacion?.fields["Total Abonado"]) ?? 0;
  const updatedCotizacion = await patchCotizacion(cotizacionId, {
    "Estado Cotización": "Aprobada",
    "Total Cotizado": selected.precioVentaCliente ?? 0,
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

  const skuProveedor = normalizeSku(input.skuProveedor || "");
  if (skuProveedor) {
    fields["SKU Proveedor"] = skuProveedor;
  }

  const item = await airtableRequest<AirtableRecord>(url, {
    method: "POST",
    headers: client.headers,
    body: JSON.stringify({ fields }),
  });

  const updatedCotizacion = await patchCotizacion(cotizacionId, {
    "Estado Cotización": "Convertida en Pedido",
    "Item Pedido ID": item.id,
  });

  return {
    itemId: item.id,
    cotizacion: updatedCotizacion,
  };
}

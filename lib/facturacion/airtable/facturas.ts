import "server-only";

// Cliente Airtable para la tabla "Facturas Electrónicas" en la base SUPER GEEK ADM.
// Reutiliza AIRTABLE_API_KEY + AIRTABLE_BASE_ID (mismas credenciales que lib/airtable.ts).

import type { MensajeSRI } from "../sri/recepcion";
import { etiquetaAirtable, codigoDesdeAirtable } from "../reglas/identificacion";

// ─── Config ──────────────────────────────────────────────────────────────────

const TABLE = "Facturas Electrónicas";

function getClient() {
  const token   = process.env.AIRTABLE_API_KEY?.trim();
  const baseId  = process.env.AIRTABLE_BASE_ID?.trim();
  if (!token)  throw new Error("AIRTABLE_API_KEY no configurada");
  if (!baseId) throw new Error("AIRTABLE_BASE_ID no configurada");
  return {
    baseId,
    baseUrl: `https://api.airtable.com/v0/${baseId}`,
    headers: {
      Authorization:  `Bearer ${token}`,
      "Content-Type": "application/json",
    } as Record<string, string>,
  };
}

// ─── Tipos ───────────────────────────────────────────────────────────────────

// Valores internos de Airtable — NO cambiar; son los que ya están en la tabla.
// Las etiquetas "bonitas" para la UI van en la capa visual, no aquí.
export type EstadoFactura =
  | "PENDIENTE"
  | "RECIBIDA"
  | "DEVUELTA"
  | "AUTORIZADO"
  | "NO AUTORIZADO"
  | "BORRADOR"
  | "ANULADA";

// Estado del envío de correo — columna separada de EstadoFactura
export type EstadoCorreo = "ENVIADO" | "ERROR" | "NO_ENVIADO";

export type FacturaAirtableInput = {
  claveAcceso:          string;
  numeroFactura:        string;   // "001-002-000000644"
  secuencial:           string;   // "000000644"
  estado:               EstadoFactura;
  numeroAutorizacion?:  string;
  fechaAutorizacion?:   string;   // ISO 8601
  fechaEmision:         string;   // ISO 8601 o "DD/MM/YYYY" — guardamos ISO
  ambiente:             "1" | "2";
  clienteNombre:        string;
  clienteIdentificacion:string;
  /** Código SRI: "04" RUC · "05" cédula · "06" pasaporte · "07" cons. final · "08" exterior. */
  clienteTipoIdentificacion?: string;
  clienteCorreo?:       string;
  subtotal:             number;
  iva:                  number;
  total:                number;
  mensajesSri?:         MensajeSRI[];
  lineasJson?:          string;   // JSON serializado del array de detalles / payload borrador
  estadoCorreo?:        EstadoCorreo;
  // Fase 16 PR2 (gancho): links de vuelta a la orden/operación/cliente de
  // origen — base de la idempotencia (campo inverso "Facturas Electrónicas"
  // en Órdenes/Operación). Ausentes en facturas de mostrador.
  ordenId?:             string;
  operacionId?:         string;
  clienteId?:           string;
};

export type FacturaAirtableRecord = FacturaAirtableInput & {
  recordId: string;
};

// Estado de la sincronización de inventario post-emisión (Fase 16 PR3).
// "N/A" = factura de mostrador (nunca dispara postEmision). Las facturas
// del gancho pasan N/A → PENDIENTE → OK|ERROR.
export type EstadoSincronizacionInventario = "N/A" | "PENDIENTE" | "OK" | "ERROR";

// Registro completo leído del historial
export type FacturaHistorial = {
  recordId:             string;
  claveAcceso:          string;
  numeroFactura:        string;
  estado:               EstadoFactura;
  estadoCorreo:         EstadoCorreo;
  ambiente:             "PRUEBAS" | "PRODUCCIÓN";
  fechaEmision:         string;   // "YYYY-MM-DD"
  fechaAutorizacion:    string;
  numeroAutorizacion:   string;
  clienteNombre:        string;
  clienteIdentificacion:string;
  /** Código SRI guardado. undefined en facturas anteriores a este campo. */
  clienteTipoIdentificacion?: string;
  clienteCorreo:        string;
  subtotal:             number;
  iva:                  number;
  total:                number;
  mensajesSri:          string;
  lineasJson:           string;
  tieneXml:             boolean;
  tieneRide:            boolean;
  sincronizacionInventario: EstadoSincronizacionInventario;
  errorSincronizacion:      string;
};

// Filtros para el listado
export type FiltrosHistorial = {
  fechaDesde?:   string;   // "YYYY-MM-DD"
  fechaHasta?:   string;
  cliente?:      string;   // búsqueda parcial nombre o identificación
  numero?:       string;   // búsqueda parcial número de factura
  estado?:       EstadoFactura;
  ambiente?:     "PRUEBAS" | "PRODUCCIÓN";
  pageSize?:     number;
  offset?:       string;   // Airtable cursor
};

export type ListadoFacturas = {
  facturas: FacturaHistorial[];
  offset?:  string;        // cursor para siguiente página
  total:    number;        // total de registros devueltos en esta página
  suma:     number;        // suma de totales en esta página
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function airtableRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const client = getClient();
  const res = await fetch(url, {
    ...init,
    headers: {
      ...client.headers,
      ...(init?.headers as Record<string, string> ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable ${init?.method ?? "GET"} ${url} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

function tableUrl(recordId?: string) {
  const c = getClient();
  const base = `${c.baseUrl}/${encodeURIComponent(TABLE)}`;
  return recordId ? `${base}/${encodeURIComponent(recordId)}` : base;
}

function uploadUrl(recordId: string, field: string) {
  const c = getClient();
  // Content API: /v0/{baseId}/{recordId}/{field}/uploadAttachment  — sin tabla
  return `https://content.airtable.com/v0/${encodeURIComponent(c.baseId)}/${encodeURIComponent(recordId)}/${encodeURIComponent(field)}/uploadAttachment`;
}

export function ambienteLabel(a: "1" | "2"): "PRUEBAS" | "PRODUCCIÓN" {
  return a === "1" ? "PRUEBAS" : "PRODUCCIÓN";
}

function safeStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function safeNum(v: unknown): number {
  if (typeof v === "number") return v;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}
function hasAttachment(v: unknown): boolean {
  return Array.isArray(v) && v.length > 0;
}

function mapHistorialRecord(r: { id: string; fields: Record<string, unknown> }): FacturaHistorial {
  const f = r.fields;
  const estadoRaw   = safeStr(f["Estado"]);
  const correoRaw   = safeStr(f["Estado Correo"]);
  const ambienteRaw = safeStr(f["Ambiente"]);
  const syncRaw     = safeStr(f["Sincronización Inventario"]);

  return {
    recordId:              r.id,
    claveAcceso:           safeStr(f["Clave de Acceso"]),
    numeroFactura:         safeStr(f["Número de Factura"]),
    estado:                (estadoRaw as EstadoFactura) || "PENDIENTE",
    estadoCorreo:          (correoRaw as EstadoCorreo) || "NO_ENVIADO",
    ambiente:              (ambienteRaw === "PRODUCCIÓN" ? "PRODUCCIÓN" : "PRUEBAS"),
    fechaEmision:          safeStr(f["Fecha de Emisión"]),
    fechaAutorizacion:     safeStr(f["Fecha de Autorización"]),
    numeroAutorizacion:    safeStr(f["Número de Autorización"]),
    clienteNombre:         safeStr(f["Cliente - Nombre"]),
    clienteIdentificacion: safeStr(f["Cliente - Identificación"]),
    clienteCorreo:         safeStr(f["Cliente - Correo"]),
    subtotal:              safeNum(f["Subtotal"]),
    iva:                   safeNum(f["IVA"]),
    total:                 safeNum(f["Total"]),
    clienteTipoIdentificacion: codigoDesdeAirtable(safeStr(f["Cliente - Tipo Identificación"])),
    mensajesSri:           safeStr(f["Mensajes SRI"]),
    lineasJson:            safeStr(f["Líneas JSON"]),
    tieneXml:              hasAttachment(f["XML Autorizado"]),
    tieneRide:             hasAttachment(f["RIDE PDF"]),
    sincronizacionInventario: (syncRaw as EstadoSincronizacionInventario) || "N/A",
    errorSincronizacion:      safeStr(f["Error Sincronización"]),
  };
}

// ─── Leer máximo secuencial usado ─────────────────────────────────────────────
//
// Incluye TODOS los estados que implican haber enviado un número al SRI:
//   AUTORIZADO, DEVUELTA, NO AUTORIZADO, PENDIENTE, RECIBIDA.
// Excluye BORRADOR (secuencial 0, nunca enviado) y ANULADA.
// El {Secuencial}>0 es una salvaguarda extra contra borradores con datos anómalos.
//
// Antes solo filtraba {Estado}="AUTORIZADO", lo que provocaba que registros
// DEVUELTA con secuencial alto quedaran invisibles y el sistema reutilizara
// esos números, generando errores 43/45 en cascada.
//
// ─── Por qué filtra por AMBIENTE (hallazgo M-1, auditoría 2026-08-04) ───────
//
// Antes no lo hacía: pruebas y producción compartían una sola numeración. Dos
// consecuencias, las dos malas:
//
//   · Al pasar a producción, el sistema arrancaba desde el número más alto de
//     las facturas de PRUEBA (hoy el 685), un número inventado contra celcer
//     que no tiene nada que ver con la serie real del SRI.
//   · Si alguien vuelve a poner SRI_AMBIENTE=1 después del cutover —para
//     probar algo— esas facturas ficticias consumirían números de la serie
//     REAL, dejando huecos que hay que justificar ante el SRI.
//
// Con el filtro, cada ambiente lleva su propia cuenta. En producción, la
// primera factura sale del valor de SRI_SECUENCIAL (la tabla no tiene ninguna
// factura de PRODUCCIÓN todavía), que es justo lo que se quiere en el corte.

export async function maxSecuencialUsado(
  estab: string,
  ptoEmi: string,
  ambiente: "1" | "2"
): Promise<number | null> {
  const client = getClient();
  const prefijo = `${estab}-${ptoEmi}-`;

  const params = new URLSearchParams({
    filterByFormula: `AND(LEFT({Número de Factura},${prefijo.length})="${prefijo}",{Secuencial}>0,{Ambiente}="${ambienteLabel(ambiente)}",NOT(OR({Estado}="BORRADOR",{Estado}="ANULADA")))`,
    "sort[0][field]":     "Secuencial",
    "sort[0][direction]": "desc",
    maxRecords:           "1",
    "fields[]":           "Secuencial",
  });

  const url = `${client.baseUrl}/${encodeURIComponent(TABLE)}?${params}`;
  const data = await airtableRequest<{ records: Array<{ fields: { Secuencial?: string | number } }> }>(url);

  if (!data.records.length) return null;
  const raw = data.records[0].fields["Secuencial"];
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

// ─── Crear registro (todos los campos escalares) ──────────────────────────────

export async function crearRegistroFactura(
  input: FacturaAirtableInput,
  /**
   * Si se pasa, ACTUALIZA ese registro en vez de crear uno nuevo.
   *
   * Lo usa emitirFactura() para el comprobante que ya se persistió como
   * RECIBIDA antes de esperar la autorización: cuando el SRI responde, hay
   * que completar esa misma fila —no crear una segunda con el mismo número.
   */
  recordIdExistente?: string
): Promise<string> {
  const mensajesTexto = input.mensajesSri?.length
    ? input.mensajesSri
        .map((m) => `[${m.identificador}] ${m.tipo}: ${m.mensaje}${m.informacionAdicional ? " — " + m.informacionAdicional : ""}`)
        .join("\n")
    : undefined;

  const fields: Record<string, unknown> = {
    "Clave de Acceso":         input.claveAcceso,
    "Número de Factura":       input.numeroFactura,
    "Secuencial":              parseInt(input.secuencial, 10),
    "Estado":                  input.estado,
    "Fecha de Emisión":        input.fechaEmision.includes("T")
                                 ? input.fechaEmision.split("T")[0]
                                 : input.fechaEmision,
    "Ambiente":                ambienteLabel(input.ambiente),
    "Cliente - Nombre":        input.clienteNombre,
    "Cliente - Identificación":input.clienteIdentificacion,
    "Subtotal":                input.subtotal,
    "IVA":                     input.iva,
    "Total":                   input.total,
    // Fase 16 PR2: siempre "N/A" al crear — el estado real (PENDIENTE/OK/
    // ERROR) lo asigna postEmision() en Fase 16 PR3. Se setea para todas
    // las facturas (mostrador incluido), no solo las del gancho.
    "Sincronización Inventario": "N/A",
  };

  if (input.numeroAutorizacion)   fields["Número de Autorización"] = input.numeroAutorizacion;
  if (input.fechaAutorizacion)    fields["Fecha de Autorización"]  = input.fechaAutorizacion;
  if (input.clienteCorreo)        fields["Cliente - Correo"]       = input.clienteCorreo;
  // El tipo se GUARDA para que nadie tenga que volver a adivinarlo: al
  // reintentar, al corregir o al hacer una nota de crédito, un pasaporte
  // debe seguir siendo un pasaporte y no convertirse en cédula por su largo.
  const etiquetaTipo = etiquetaAirtable(input.clienteTipoIdentificacion ?? "");
  if (etiquetaTipo)               fields["Cliente - Tipo Identificación"] = etiquetaTipo;
  if (mensajesTexto)              fields["Mensajes SRI"]           = mensajesTexto;
  if (input.lineasJson)           fields["Líneas JSON"]            = input.lineasJson;
  if (input.estadoCorreo)         fields["Estado Correo"]          = input.estadoCorreo;
  // Fase 16 PR2: links al origen — base de la idempotencia (campo inverso
  // "Facturas Electrónicas" en Órdenes de Reparación / Operación Comercial).
  if (input.ordenId)              fields["Orden"]                  = [input.ordenId];
  if (input.operacionId)          fields["Operación"]               = [input.operacionId];
  if (input.clienteId)            fields["Cliente"]                 = [input.clienteId];

  if (recordIdExistente) {
    // "Sincronización Inventario" se deja fuera al actualizar: postEmision()
    // puede haberla escrito ya y sobreescribirla con "N/A" borraría el rastro.
    delete fields["Sincronización Inventario"];
    const body = await airtableRequest<{ id: string }>(
      `${tableUrl()}/${encodeURIComponent(recordIdExistente)}`,
      { method: "PATCH", body: JSON.stringify({ fields, typecast: true }) }
    );
    return body.id;
  }

  const body = await airtableRequest<{ id: string }>(tableUrl(), {
    method: "POST",
    body:   JSON.stringify({ fields }),
  });

  return body.id;
}

// ─── Crear borrador (sin clave de acceso, sin secuencial) ─────────────────────

export type BorradorInput = {
  ambiente:             "1" | "2";
  clienteNombre:        string;
  clienteIdentificacion:string;
  clienteCorreo?:       string;
  subtotal:             number;
  iva:                  number;
  total:                number;
  lineasJson:           string;  // JSON con payload completo del form
};

export async function crearBorrador(input: BorradorInput): Promise<string> {
  const fields: Record<string, unknown> = {
    "Estado":                  "BORRADOR",
    "Ambiente":                ambienteLabel(input.ambiente),
    "Cliente - Nombre":        input.clienteNombre,
    "Cliente - Identificación":input.clienteIdentificacion,
    "Subtotal":                input.subtotal,
    "IVA":                     input.iva,
    "Total":                   input.total,
    "Líneas JSON":             input.lineasJson,
    // Campos requeridos por Airtable — vacíos en borrador
    "Clave de Acceso":         "",
    "Número de Factura":       "",
    "Secuencial":              0,
    "Fecha de Emisión":        new Date().toISOString().split("T")[0],
  };

  if (input.clienteCorreo) fields["Cliente - Correo"] = input.clienteCorreo;

  const body = await airtableRequest<{ id: string }>(tableUrl(), {
    method: "POST",
    body:   JSON.stringify({ fields }),
  });

  return body.id;
}

export async function actualizarBorrador(
  recordId: string,
  input: BorradorInput
): Promise<void> {
  const fields: Record<string, unknown> = {
    "Cliente - Nombre":        input.clienteNombre,
    "Cliente - Identificación":input.clienteIdentificacion,
    "Subtotal":                input.subtotal,
    "IVA":                     input.iva,
    "Total":                   input.total,
    "Líneas JSON":             input.lineasJson,
    "Fecha de Emisión":        new Date().toISOString().split("T")[0],
  };
  if (input.clienteCorreo !== undefined) fields["Cliente - Correo"] = input.clienteCorreo;

  await airtableRequest(tableUrl(recordId), {
    method: "PATCH",
    body:   JSON.stringify({ fields }),
  });
}

// ─── Listar facturas con filtros ──────────────────────────────────────────────

export async function listarFacturas(filtros: FiltrosHistorial = {}): Promise<ListadoFacturas> {
  const client   = getClient();
  const pageSize = filtros.pageSize ?? 50;

  const conditions: string[] = [];

  if (filtros.fechaDesde) conditions.push(`{Fecha de Emisión} >= "${filtros.fechaDesde}"`);
  if (filtros.fechaHasta) conditions.push(`{Fecha de Emisión} <= "${filtros.fechaHasta}"`);
  if (filtros.estado)     conditions.push(`{Estado} = "${filtros.estado}"`);
  if (filtros.ambiente)   conditions.push(`{Ambiente} = "${filtros.ambiente}"`);
  if (filtros.numero) {
    const esc = filtros.numero.replace(/"/g, '\\"');
    conditions.push(`SEARCH("${esc}", {Número de Factura})`);
  }
  if (filtros.cliente) {
    const esc = filtros.cliente.replace(/"/g, '\\"');
    conditions.push(
      `OR(SEARCH("${esc}",LOWER({Cliente - Nombre})),SEARCH("${esc}",{Cliente - Identificación}))`
    );
  }

  const formula = conditions.length === 0
    ? ""
    : conditions.length === 1
      ? conditions[0]
      : `AND(${conditions.join(",")})`;

  const params = new URLSearchParams({
    "sort[0][field]":     "Fecha de Emisión",
    "sort[0][direction]": "desc",
    pageSize:             String(pageSize),
  });
  if (formula)         params.set("filterByFormula", formula);
  if (filtros.offset)  params.set("offset", filtros.offset);

  const FIELDS = [
    "Clave de Acceso", "Número de Factura", "Estado", "Estado Correo",
    "Ambiente", "Fecha de Emisión", "Fecha de Autorización", "Número de Autorización",
    "Cliente - Nombre", "Cliente - Identificación", "Cliente - Correo",
    "Subtotal", "IVA", "Total", "Mensajes SRI", "Líneas JSON",
    "XML Autorizado", "RIDE PDF",
    "Sincronización Inventario", "Error Sincronización",
  ];
  for (const f of FIELDS) params.append("fields[]", f);

  const url  = `${client.baseUrl}/${encodeURIComponent(TABLE)}?${params}`;
  const data = await airtableRequest<{
    records: Array<{ id: string; fields: Record<string, unknown> }>;
    offset?: string;
  }>(url);

  const facturas = (data.records ?? []).map(mapHistorialRecord);
  const suma     = facturas.reduce((acc, f) => acc + f.total, 0);

  return {
    facturas,
    offset: data.offset,
    total:  facturas.length,
    suma,
  };
}

// ─── Obtener factura individual ───────────────────────────────────────────────

export async function obtenerFactura(recordId: string): Promise<FacturaHistorial | null> {
  try {
    const data = await airtableRequest<{ id: string; fields: Record<string, unknown> }>(
      tableUrl(recordId)
    );
    return mapHistorialRecord(data);
  } catch {
    return null;
  }
}

// ─── Subir adjunto ────────────────────────────────────────────────────────────

export async function subirAdjunto(
  recordId:    string,
  campo:       "XML Autorizado" | "RIDE PDF",
  filename:    string,
  contentType: string,
  fileBase64:  string
): Promise<void> {
  const client = getClient();
  const url = uploadUrl(recordId, campo);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...client.headers,
      "Content-Type": "application/json",
      Accept:         "application/json",
    },
    body: JSON.stringify({ contentType, filename, file: fileBase64 }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable uploadAttachment (${campo}) ${res.status}: ${text}`);
  }
}

// ─── Historial de intentos ────────────────────────────────────────────────────
//
// Escribe "Mensajes SRI" con el texto COMPLETO ya acumulado. El que llama es
// quien acumula (lib/facturacion/historialIntentos.ts); aquí solo se guarda.
// Se separa de crearRegistroFactura a propósito: ese sobreescribe el campo con
// los mensajes del último intento, y perder los anteriores es justo lo que hay
// que evitar.

export async function actualizarMensajesSri(recordId: string, historial: string): Promise<void> {
  await airtableRequest(tableUrl(recordId), {
    method: "PATCH",
    body:   JSON.stringify({ fields: { "Mensajes SRI": historial } }),
  });
}

// ─── Actualizar estado ────────────────────────────────────────────────────────

export async function actualizarEstadoFactura(
  recordId: string,
  estado:   EstadoFactura,
  extra?:   Partial<Record<string, unknown>>
): Promise<void> {
  await airtableRequest(tableUrl(recordId), {
    method: "PATCH",
    body:   JSON.stringify({ fields: { "Estado": estado, ...(extra ?? {}) } }),
  });
}

// ─── Actualizar estado correo ────────────────────────────────────────────────

export async function actualizarEstadoCorreo(
  recordId: string,
  estado:   EstadoCorreo
): Promise<void> {
  await airtableRequest(tableUrl(recordId), {
    method: "PATCH",
    body:   JSON.stringify({ fields: { "Estado Correo": estado } }),
  });
}

// ─── Actualizar sincronización de inventario (Fase 16 PR3) ──────────────────
// Estado del post-emisión: PENDIENTE mientras corre, OK/ERROR al terminar.
// "Error Sincronización" se limpia en OK (por si es un reintento que corrige
// un ERROR previo) y se completa con detalle legible en ERROR.

export async function actualizarSincronizacionInventario(
  recordId: string,
  estado:   Exclude<EstadoSincronizacionInventario, "N/A">,
  errorDetalle?: string
): Promise<void> {
  const fields: Record<string, unknown> = { "Sincronización Inventario": estado };
  fields["Error Sincronización"] = estado === "ERROR" ? (errorDetalle ?? "") : "";
  await airtableRequest(tableUrl(recordId), {
    method: "PATCH",
    body:   JSON.stringify({ fields }),
  });
}

// ─── Marcar adjuntos pendientes ───────────────────────────────────────────────
// Usado cuando el comprobante quedó AUTORIZADO en disco pero sin adjuntos en Airtable.

export async function marcarAdjuntosPendientes(recordId: string): Promise<void> {
  await airtableRequest(tableUrl(recordId), {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        "Mensajes SRI": "⚠ ADJUNTO PENDIENTE: XML/RIDE no subidos a Airtable. Comprobante respaldado en disco.",
      },
    }),
  });
}

// ─── Buscar factura por clave de acceso ───────────────────────────────────────

export async function buscarFacturaPorClave(claveAcceso: string): Promise<FacturaHistorial | null> {
  const client = getClient();
  const esc    = claveAcceso.replace(/"/g, '\\"');
  const params = new URLSearchParams({
    filterByFormula: `{Clave de Acceso}="${esc}"`,
    maxRecords:      "1",
  });
  const FIELDS = [
    "Clave de Acceso", "Número de Factura", "Estado", "Estado Correo",
    "Ambiente", "Fecha de Emisión", "Fecha de Autorización", "Número de Autorización",
    "Cliente - Nombre", "Cliente - Identificación", "Cliente - Correo",
    "Subtotal", "IVA", "Total", "Mensajes SRI", "Líneas JSON",
    "XML Autorizado", "RIDE PDF",
    "Sincronización Inventario", "Error Sincronización",
  ];
  for (const f of FIELDS) params.append("fields[]", f);
  const url  = `${client.baseUrl}/${encodeURIComponent(TABLE)}?${params}`;
  const data = await airtableRequest<{
    records: Array<{ id: string; fields: Record<string, unknown> }>;
  }>(url);
  if (!data.records.length) return null;
  return mapHistorialRecord(data.records[0]);
}

// ─── Obtener adjunto (XML/RIDE) por clave de acceso ──────────────────────────
// Fallback para cuando el archivo no está en disco (p.ej. Vercel: la
// invocación que emitió y la que sirve la descarga pueden no compartir
// /tmp). "Clave de Acceso" es un campo de texto, no un link — filtrar por
// él con filterByFormula es seguro (regla de la casa: nunca filtrar por
// campo link; aquí no aplica, no es un link).

export type AdjuntoFactura = { url: string; filename: string };

export async function obtenerAdjuntoPorClave(
  claveAcceso: string,
  campo: "XML Autorizado" | "RIDE PDF"
): Promise<AdjuntoFactura | null> {
  const client = getClient();
  const esc = claveAcceso.replace(/"/g, '\\"');
  const params = new URLSearchParams({
    filterByFormula: `{Clave de Acceso}="${esc}"`,
    maxRecords:      "1",
  });
  params.append("fields[]", campo);
  const url  = `${client.baseUrl}/${encodeURIComponent(TABLE)}?${params}`;
  const data = await airtableRequest<{
    records: Array<{ id: string; fields: Record<string, unknown> }>;
  }>(url);
  if (!data.records.length) return null;

  const adjuntos = data.records[0].fields[campo];
  if (!Array.isArray(adjuntos) || adjuntos.length === 0) return null;

  const primero = adjuntos[0] as { url?: unknown; filename?: unknown };
  if (typeof primero.url !== "string" || !primero.url) return null;

  return {
    url:      primero.url,
    filename: typeof primero.filename === "string" ? primero.filename : claveAcceso,
  };
}

// ─── Eliminar registro (solo BORRADOR) ───────────────────────────────────────

export async function eliminarRegistroFactura(recordId: string): Promise<void> {
  const client = getClient();
  const url    = tableUrl(recordId);
  const res    = await fetch(url, {
    method:  "DELETE",
    headers: client.headers,
    cache:   "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable DELETE ${url} → ${res.status}: ${text}`);
  }
}

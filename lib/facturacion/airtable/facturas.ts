import "server-only";

// Cliente Airtable para la tabla "Facturas Electrónicas" en la base SUPER GEEK ADM.
// Reutiliza AIRTABLE_API_KEY + AIRTABLE_BASE_ID (mismas credenciales que lib/airtable.ts).

import type { MensajeSRI } from "../sri/recepcion";

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

export type EstadoFactura =
  | "PENDIENTE"
  | "RECIBIDA"
  | "DEVUELTA"
  | "AUTORIZADO"
  | "NO AUTORIZADO";

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
  clienteCorreo?:       string;
  subtotal:             number;
  iva:                  number;
  total:                number;
  mensajesSri?:         MensajeSRI[];
};

export type FacturaAirtableRecord = FacturaAirtableInput & {
  recordId: string;
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
  return `https://content.airtable.com/v0/${encodeURIComponent(c.baseId)}/${encodeURIComponent(recordId)}/${encodeURIComponent(field)}/uploadAttachment`;
}

function ambienteLabel(a: "1" | "2"): "PRUEBAS" | "PRODUCCIÓN" {
  return a === "1" ? "PRUEBAS" : "PRODUCCIÓN";
}

// ─── Leer máximo secuencial ───────────────────────────────────────────────────

/**
 * Devuelve el número entero del mayor secuencial registrado como AUTORIZADO
 * para el prefijo estab-ptoEmi dado, o null si no hay ninguno.
 */
export async function maxSecuencialAutorizado(
  estab: string,
  ptoEmi: string
): Promise<number | null> {
  const client = getClient();
  const prefijo = `${estab}-${ptoEmi}-`;

  const params = new URLSearchParams({
    filterByFormula:      `AND(LEFT({Número de Factura},${prefijo.length})="${prefijo}",{Estado}="AUTORIZADO")`,
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
  input: FacturaAirtableInput
): Promise<string> {
  const mensajesTexto = input.mensajesSri?.length
    ? input.mensajesSri
        .map((m) => `[${m.identificador}] ${m.tipo}: ${m.mensaje}${m.informacionAdicional ? " — " + m.informacionAdicional : ""}`)
        .join("\n")
    : undefined;

  const fields: Record<string, unknown> = {
    "Clave de Acceso":         input.claveAcceso,
    "Número de Factura":       input.numeroFactura,
    // Secuencial puede ser campo Número en Airtable; enviamos entero
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
  };

  if (input.numeroAutorizacion)   fields["Número de Autorización"] = input.numeroAutorizacion;
  if (input.fechaAutorizacion)    fields["Fecha de Autorización"]  = input.fechaAutorizacion;
  if (input.clienteCorreo)        fields["Cliente - Correo"]       = input.clienteCorreo;
  if (mensajesTexto)              fields["Mensajes SRI"]           = mensajesTexto;

  const body = await airtableRequest<{ id: string }>(tableUrl(), {
    method: "POST",
    body:   JSON.stringify({ fields }),
  });

  return body.id;
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

// ─── Eliminar registro (rollback si adjuntos fallan) ─────────────────────────

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

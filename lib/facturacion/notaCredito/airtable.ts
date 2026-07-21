import "server-only";

// Persistencia de notas de crédito en Airtable — tabla "Notas de Crédito
// Electrónicas" (base SUPER GEEK ADM, la misma de todo el sistema).
//
// Módulo propio, deliberadamente separado de airtable/facturas.ts: aunque la
// estructura es espejo, mezclar ambas en un solo archivo obligaría a tocar el
// módulo de facturas que ya está en producción. Mismo criterio que el builder
// de XML (ver nota en construirNotaCreditoXml.ts).
//
// Regla de la casa: la tabla y los campos se referencian POR NOMBRE.

const TABLE = "Notas de Crédito Electrónicas";

function getClient() {
  const token  = process.env.AIRTABLE_API_KEY?.trim();
  const baseId = process.env.AIRTABLE_BASE_ID?.trim();
  if (!token)  throw new Error("Falta AIRTABLE_API_KEY en .env.local.");
  if (!baseId) throw new Error("Falta AIRTABLE_BASE_ID en .env.local.");
  return {
    baseId,
    baseUrl: `https://api.airtable.com/v0/${baseId}`,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } as Record<string, string>,
  };
}

async function airtableRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const client = getClient();
  const res = await fetch(url, {
    ...init,
    headers: { ...client.headers, ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable ${TABLE} ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type EstadoNotaCredito =
  | "AUTORIZADO"
  | "DEVUELTA"
  | "NO AUTORIZADO"
  | "PENDIENTE"
  | "RECIBIDA"
  | "ANULADA";

/**
 * Seguimiento de la aceptación del receptor (regla SRI 2026: 5 días hábiles).
 * El SRI no expone webservice para consultarlo — el usuario lo confirma en
 * SRI en línea y lo marca aquí a mano.
 */
export type EstadoAceptacion =
  | "Pendiente de aceptación"
  | "Aceptada"
  | "Rechazada"
  | "Sin efecto";

export type NotaCreditoAirtableInput = {
  claveAcceso:           string;
  numeroNotaCredito:     string;   // "001-002-000000002"
  secuencial:            string;
  estado:                EstadoNotaCredito;
  numeroAutorizacion?:   string;
  fechaAutorizacion?:    string;   // ISO
  fechaEmision:          string;   // ISO
  ambiente:              "1" | "2";
  clienteNombre:         string;
  clienteIdentificacion: string;
  clienteCorreo?:        string;
  motivo:                string;
  /** Número de la factura modificada, "001-002-000000681". */
  numeroFacturaModificada: string;
  /** Record id de la factura en "Facturas Electrónicas" (link real). */
  facturaRecordId?:      string;
  clienteRecordId?:      string;
  subtotal:              number;
  iva:                   number;
  total:                 number;   // valorModificacion
  lineasJson?:           string;
  mensajesSri?:          Array<{ identificador: string; tipo: string; mensaje: string; informacionAdicional?: string }>;
  estadoAceptacion?:     EstadoAceptacion;
  fechaLimiteAceptacion?: string;  // ISO (5 días hábiles desde emisión)
};

// ─── Secuencial ──────────────────────────────────────────────────────────────
//
// Misma lógica que facturas: MAX(Secuencial) sobre las NC que ya tomaron un
// número real ante el SRI. Excluye ANULADA. La semilla SRI_SECUENCIAL_NC solo
// aplica cuando la tabla está vacía — dato de negocio confirmado por el dueño:
// la última NC del sistema viejo es la 001-002-000000001, así que producción
// arranca en 2.

export async function maxSecuencialNotaCreditoUsado(
  estab: string,
  ptoEmi: string
): Promise<number | null> {
  const client  = getClient();
  const prefijo = `${estab}-${ptoEmi}-`;

  const params = new URLSearchParams({
    filterByFormula: `AND(LEFT({Número de Nota de Crédito},${prefijo.length})="${prefijo}",{Secuencial}>0,{Estado}!="ANULADA")`,
    "sort[0][field]":     "Secuencial",
    "sort[0][direction]": "desc",
    maxRecords:           "1",
    "fields[]":           "Secuencial",
  });

  const data = await airtableRequest<{ records: Array<{ fields: { Secuencial?: string | number } }> }>(
    `${client.baseUrl}/${encodeURIComponent(TABLE)}?${params}`
  );

  if (!data.records.length) return null;
  const raw = data.records[0].fields["Secuencial"];
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

// ─── Crear registro ──────────────────────────────────────────────────────────

export async function crearRegistroNotaCredito(input: NotaCreditoAirtableInput): Promise<string> {
  const client = getClient();

  const mensajesTexto = input.mensajesSri?.length
    ? input.mensajesSri
        .map((m) => `[${m.identificador}] ${m.tipo}: ${m.mensaje}${m.informacionAdicional ? ` — ${m.informacionAdicional}` : ""}`)
        .join("\n")
    : undefined;

  const fields: Record<string, unknown> = {
    "Clave de Acceso":            input.claveAcceso,
    "Número de Nota de Crédito":  input.numeroNotaCredito,
    "Secuencial":                 parseInt(input.secuencial, 10),
    "Estado":                     input.estado,
    "Fecha de Emisión":           input.fechaEmision.slice(0, 10),
    "Ambiente":                   input.ambiente === "2" ? "PRODUCCIÓN" : "PRUEBAS",
    "Cliente Nombre":             input.clienteNombre,
    "Cliente Identificación":     input.clienteIdentificacion,
    "Motivo":                     input.motivo,
    "Factura Modificada (Número)": input.numeroFacturaModificada,
    "Subtotal":                   input.subtotal,
    "IVA":                        input.iva,
    "Total":                      input.total,
  };

  if (input.numeroAutorizacion)   fields["Número de Autorización"] = input.numeroAutorizacion;
  if (input.fechaAutorizacion)    fields["Fecha de Autorización"]  = input.fechaAutorizacion;
  if (input.clienteCorreo)        fields["Cliente Correo"]         = input.clienteCorreo;
  if (input.lineasJson)           fields["Líneas JSON"]            = input.lineasJson;
  if (mensajesTexto)              fields["Mensajes SRI"]           = mensajesTexto;
  if (input.estadoAceptacion)     fields["Estado Aceptación"]      = input.estadoAceptacion;
  if (input.fechaLimiteAceptacion) fields["Fecha Límite Aceptación"] = input.fechaLimiteAceptacion.slice(0, 10);
  if (input.facturaRecordId)      fields["Factura"]                = [input.facturaRecordId];
  if (input.clienteRecordId)      fields["Cliente"]                = [input.clienteRecordId];

  const data = await airtableRequest<{ id: string }>(
    `${client.baseUrl}/${encodeURIComponent(TABLE)}`,
    { method: "POST", body: JSON.stringify({ fields, typecast: true }) }
  );
  return data.id;
}

// ─── Adjuntos (XML / RIDE) ───────────────────────────────────────────────────

export async function subirAdjuntoNotaCredito(
  recordId: string,
  campo:    "XML Autorizado" | "RIDE PDF",
  filename: string,
  contentType: string,
  base64:   string
): Promise<void> {
  const client = getClient();
  const url = `https://content.airtable.com/v0/${encodeURIComponent(client.baseId)}/${encodeURIComponent(recordId)}/${encodeURIComponent(campo)}/uploadAttachment`;
  await airtableRequest(url, {
    method: "POST",
    body: JSON.stringify({ contentType, file: base64, filename }),
  });
}

// ─── Total ya acreditado sobre una factura ───────────────────────────────────
//
// Necesario para la regla "no acreditar más de lo facturado". Se filtra por el
// NÚMERO de la factura (campo de texto), nunca por el campo link — regla de la
// casa: filtrar por link falla en silencio.

export async function totalAcreditadoDeFactura(numeroFactura: string): Promise<number> {
  const client = getClient();
  const params = new URLSearchParams({
    filterByFormula: `AND({Factura Modificada (Número)}="${numeroFactura}",{Estado}="AUTORIZADO",{Estado Aceptación}!="Sin efecto",{Estado Aceptación}!="Rechazada")`,
    "fields[]": "Total",
    pageSize: "100",
  });

  const data = await airtableRequest<{ records: Array<{ fields: { Total?: number } }> }>(
    `${client.baseUrl}/${encodeURIComponent(TABLE)}?${params}`
  );

  const suma = data.records.reduce((s, r) => s + (typeof r.fields.Total === "number" ? r.fields.Total : 0), 0);
  return Math.round((suma + Number.EPSILON) * 100) / 100;
}

// ─── Estado de aceptación (seguimiento manual del receptor) ──────────────────

export async function actualizarEstadoAceptacion(
  recordId: string,
  estado:   EstadoAceptacion
): Promise<void> {
  const client = getClient();
  await airtableRequest(
    `${client.baseUrl}/${encodeURIComponent(TABLE)}/${encodeURIComponent(recordId)}`,
    { method: "PATCH", body: JSON.stringify({ fields: { "Estado Aceptación": estado }, typecast: true }) }
  );
}

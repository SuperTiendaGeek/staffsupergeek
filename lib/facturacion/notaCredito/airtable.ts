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
  /** Fase 18 PR2b — tipo de NC: "Cambio de equipo" / "Saldo a favor". */
  destino?:              string;
  /** Fase 18 PR2c — crédito interno disponible; arranca = total y baja al usarse en facturas de reemplazo. */
  saldoDisponible?:      number;
};

// ─── Secuencial ──────────────────────────────────────────────────────────────
//
// Misma lógica que facturas, filtro de AMBIENTE incluido (hallazgo M-1): las
// notas de crédito de prueba no consumen numeración de producción ni al revés.
// Excluye ANULADA.
//
// La semilla SRI_SECUENCIAL_NC solo aplica cuando no hay ninguna NC de ese
// ambiente. En el corte a producción eso es exactamente lo que pasa, así que
// el valor de esa variable SÍ manda — hay que fijarlo con el último número
// real del sistema viejo el mismo día del corte, no antes.

export async function maxSecuencialNotaCreditoUsado(
  estab: string,
  ptoEmi: string,
  ambiente: "1" | "2"
): Promise<number | null> {
  const client  = getClient();
  const prefijo = `${estab}-${ptoEmi}-`;
  const etiquetaAmbiente = ambiente === "2" ? "PRODUCCIÓN" : "PRUEBAS";

  const params = new URLSearchParams({
    filterByFormula: `AND(LEFT({Número de Nota de Crédito},${prefijo.length})="${prefijo}",{Secuencial}>0,{Ambiente}="${etiquetaAmbiente}",{Estado}!="ANULADA")`,
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
  if (input.destino)              fields["Destino"]                = input.destino;
  if (input.saldoDisponible !== undefined) fields["Saldo Disponible"] = input.saldoDisponible;
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
  // Cuenta TODAS las NC AUTORIZADAS de esta factura. Una NC autorizada es
  // válida y acredita, sin depender de ninguna aceptación (corrección del
  // 2026-07-22). Cuando exista el flujo de anulación de NC, una NC anulada
  // pasará a Estado="ANULADA" y dejará de contar aquí automáticamente.
  const params = new URLSearchParams({
    filterByFormula: `AND({Factura Modificada (Número)}="${numeroFactura}",{Estado}="AUTORIZADO")`,
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

// ─── Estado del reverso de inventario (Fase 18 PR2a) ─────────────────────────
// Observabilidad del reverso, espejo de "Sincronización Inventario" en facturas.

export type EstadoReversoInventario = "N/A" | "PENDIENTE" | "OK" | "ERROR";

export async function actualizarReversoInventario(
  recordId: string,
  estado:   EstadoReversoInventario,
  detalle?: string
): Promise<void> {
  const client = getClient();
  const fields: Record<string, unknown> = { "Reverso Inventario": estado };
  if (detalle !== undefined) fields["Error Reverso"] = detalle;
  await airtableRequest(
    `${client.baseUrl}/${encodeURIComponent(TABLE)}/${encodeURIComponent(recordId)}`,
    { method: "PATCH", body: JSON.stringify({ fields, typecast: true }) }
  );
}

// ─── Asiento de reversa y fecha de caducidad ─────────────────────────────────
//
// Hasta el 14-ago-2026 aquí decía que la NC no generaba ningún movimiento
// contable. Era cierto y estaba mal: el ingreso original se quedaba registrado
// y la factura de reemplazo registraba ingreso otra vez, así que una venta de
// $100 devuelta y reemplazada aparecía como $200 de ingresos con $100 de
// dinero real. Lo que NO debe generar la NC es un EGRESO DE CAJA — eso sigue
// igual: el asiento de reversa va sin cuenta.
//
// Ver docs/DISENO_NC_REVERSA_Y_CADUCIDAD.md.

/**
 * Deja constancia del asiento de reversa y arranca el reloj del crédito.
 *
 * Sin typecast a propósito: si "Estado Crédito" no tuviera la opción exacta,
 * typecast la CREARÍA en el desplegable de Airtable y el error pasaría
 * inadvertido. Preferimos que falle aquí y se vea.
 */
export async function marcarReversaContable(
  recordId:       string,
  movimientoId:   string,
  fechaCaducidad: string
): Promise<void> {
  const client = getClient();
  const fields: Record<string, unknown> = {
    "Movimiento Reversa": [movimientoId],
    "Estado Crédito":     "Vigente",
  };
  if (fechaCaducidad) fields["Fecha de Caducidad"] = fechaCaducidad;
  await airtableRequest(
    `${client.baseUrl}/${encodeURIComponent(TABLE)}/${encodeURIComponent(recordId)}`,
    { method: "PATCH", body: JSON.stringify({ fields }) }
  );
}

// ─── Obtener una NC individual por record id ─────────────────────────────────
// Para el reemplazo: leer una NC puntual sin listar (evita el tope de 100
// registros por página de Airtable y es más eficiente).

export type NotaCreditoIndividual = {
  recordId:              string;
  numeroNotaCredito:     string;
  estado:                string;
  clienteNombre:         string;
  clienteIdentificacion: string;
  clienteCorreo:         string;
  clienteRecordId?:      string;
  total:                 number;
  saldoDisponible:       number;
  lineasJson:            string;
  fechaAutorizacion:       string;
  fechaCaducidad:          string;
  estadoCredito:           string;
  movimientoReversaIds:    string[];
  movimientoCaducidadIds:  string[];
};

export async function obtenerNotaCreditoPorId(recordId: string): Promise<NotaCreditoIndividual | null> {
  const client = getClient();
  const data = await airtableRequest<{ fields: Record<string, unknown> }>(
    `${client.baseUrl}/${encodeURIComponent(TABLE)}/${encodeURIComponent(recordId)}`
  ).catch(() => null);
  if (!data) return null;
  const f = data.fields;
  return {
    recordId,
    numeroNotaCredito:     str(f["Número de Nota de Crédito"]),
    estado:                str(f["Estado"]),
    clienteNombre:         str(f["Cliente Nombre"]),
    clienteIdentificacion: str(f["Cliente Identificación"]),
    clienteCorreo:         str(f["Cliente Correo"]),
    clienteRecordId:       linkedIdsRaw(f["Cliente"])[0],
    total:                 num(f["Total"]),
    saldoDisponible:       num(f["Saldo Disponible"]),
    lineasJson:            str(f["Líneas JSON"]),
    fechaAutorizacion:      str(f["Fecha de Autorización"]),
    fechaCaducidad:         str(f["Fecha de Caducidad"]),
    estadoCredito:          str(f["Estado Crédito"]),
    movimientoReversaIds:   linkedIdsRaw(f["Movimiento Reversa"]),
    movimientoCaducidadIds: linkedIdsRaw(f["Movimiento Caducidad"]),
  };
}

// ─── Consumir crédito de la NC en una factura de reemplazo (Fase 18 PR2c) ────
//
// Descuenta `monto` del "Saldo Disponible" de la NC y enlaza la factura de
// reemplazo. Relee el saldo justo antes de escribir (mitiga carreras) e es
// idempotente: si la factura ya está enlazada como reemplazo, no vuelve a
// descontar. Devuelve el saldo resultante.

export type ResultadoConsumo =
  | { ok: true; saldoRestante: number; yaAplicada?: boolean }
  | { ok: false; error: string };

export async function consumirCreditoNotaCredito(
  notaCreditoRecordId: string,
  monto: number,
  facturaReemplazoRecordId: string
): Promise<ResultadoConsumo> {
  const client = getClient();

  const data = await airtableRequest<{ fields: Record<string, unknown> }>(
    `${client.baseUrl}/${encodeURIComponent(TABLE)}/${encodeURIComponent(notaCreditoRecordId)}`
  ).catch(() => null);
  if (!data) return { ok: false, error: "Nota de crédito no encontrada" };

  const saldoActual = num(data.fields["Saldo Disponible"]);
  const reemplazosActuales = linkedIdsRaw(data.fields["Facturas de Reemplazo"]);

  // Idempotente: esta factura ya consumió esta NC.
  if (reemplazosActuales.includes(facturaReemplazoRecordId)) {
    return { ok: true, saldoRestante: saldoActual, yaAplicada: true };
  }

  const m = Math.round((monto + Number.EPSILON) * 100) / 100;
  if (!(m > 0)) return { ok: false, error: "El monto a aplicar debe ser mayor a cero" };
  if (m > saldoActual + 0.01) {
    return { ok: false, error: `El crédito disponible ($${saldoActual.toFixed(2)}) es menor a lo que se intenta aplicar ($${m.toFixed(2)})` };
  }

  const saldoRestante = Math.round((saldoActual - m + Number.EPSILON) * 100) / 100;

  await airtableRequest(
    `${client.baseUrl}/${encodeURIComponent(TABLE)}/${encodeURIComponent(notaCreditoRecordId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        fields: {
          "Saldo Disponible": saldoRestante,
          "Facturas de Reemplazo": [...reemplazosActuales, facturaReemplazoRecordId],
        },
        typecast: true,
      }),
    }
  );

  return { ok: true, saldoRestante };
}

function linkedIdsRaw(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim() !== "");
}

// ─── Listado para el historial de notas de crédito ───────────────────────────

export type NotaCreditoHistorial = {
  recordId:               string;
  claveAcceso:            string;
  numeroNotaCredito:      string;
  estado:                 string;
  ambiente:               "PRUEBAS" | "PRODUCCIÓN";
  fechaEmision:           string;
  numeroFacturaModificada: string;
  clienteNombre:          string;
  clienteIdentificacion:  string;
  clienteCorreo:          string;
  motivo:                 string;
  total:                  number;
  destino:                string;
  saldoDisponible:        number;
  mensajesSri:            string;
  tieneXml:               boolean;
  tieneRide:              boolean;
};

export type FiltrosNotaCredito = {
  cliente?: string;
  numero?:  string;
  estado?:  string;
  pageSize?: number;
  offset?:  string;
};

function str(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  if (v && typeof v === "object" && "name" in (v as Record<string, unknown>)) return String((v as { name: unknown }).name);
  return "";
}
function num(v: unknown): number {
  if (typeof v === "number") return v;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}
function hasAtt(v: unknown): boolean {
  return Array.isArray(v) && v.length > 0;
}

export type ListadoNotasCredito = {
  notas:  NotaCreditoHistorial[];
  offset?: string;
  total:  number;
  suma:   number;
};

export async function listarNotasCredito(filtros: FiltrosNotaCredito = {}): Promise<ListadoNotasCredito> {
  const client = getClient();

  const conditions: string[] = [];
  if (filtros.estado) conditions.push(`{Estado} = "${filtros.estado}"`);
  if (filtros.numero) {
    const esc = filtros.numero.replace(/"/g, '\\"');
    conditions.push(`OR(SEARCH("${esc}",{Número de Nota de Crédito}),SEARCH("${esc}",{Factura Modificada (Número)}))`);
  }
  if (filtros.cliente) {
    const esc = filtros.cliente.replace(/"/g, '\\"').toLowerCase();
    conditions.push(`OR(SEARCH("${esc}",LOWER({Cliente Nombre})),SEARCH("${esc}",{Cliente Identificación}))`);
  }
  const formula = conditions.length === 0 ? "" : conditions.length === 1 ? conditions[0] : `AND(${conditions.join(",")})`;

  const params = new URLSearchParams({
    "sort[0][field]":     "Secuencial",
    "sort[0][direction]": "desc",
    pageSize:             String(filtros.pageSize ?? 50),
  });
  if (formula)        params.set("filterByFormula", formula);
  if (filtros.offset) params.set("offset", filtros.offset);

  const FIELDS = [
    "Clave de Acceso", "Número de Nota de Crédito", "Estado", "Ambiente",
    "Fecha de Emisión", "Factura Modificada (Número)", "Cliente Nombre",
    "Cliente Identificación", "Cliente Correo", "Motivo", "Total", "Destino",
    "Saldo Disponible", "Mensajes SRI", "XML Autorizado", "RIDE PDF",
  ];
  for (const f of FIELDS) params.append("fields[]", f);

  const data = await airtableRequest<{ records: Array<{ id: string; fields: Record<string, unknown> }>; offset?: string }>(
    `${client.baseUrl}/${encodeURIComponent(TABLE)}?${params}`
  );

  const notas: NotaCreditoHistorial[] = (data.records ?? []).map((r) => ({
    recordId:               r.id,
    claveAcceso:            str(r.fields["Clave de Acceso"]),
    numeroNotaCredito:      str(r.fields["Número de Nota de Crédito"]),
    estado:                 str(r.fields["Estado"]),
    ambiente:               str(r.fields["Ambiente"]) === "PRODUCCIÓN" ? "PRODUCCIÓN" : "PRUEBAS",
    fechaEmision:           str(r.fields["Fecha de Emisión"]),
    numeroFacturaModificada: str(r.fields["Factura Modificada (Número)"]),
    clienteNombre:          str(r.fields["Cliente Nombre"]),
    clienteIdentificacion:  str(r.fields["Cliente Identificación"]),
    clienteCorreo:          str(r.fields["Cliente Correo"]),
    motivo:                 str(r.fields["Motivo"]),
    total:                  num(r.fields["Total"]),
    destino:                str(r.fields["Destino"]),
    saldoDisponible:        num(r.fields["Saldo Disponible"]),
    mensajesSri:            str(r.fields["Mensajes SRI"]),
    tieneXml:               hasAtt(r.fields["XML Autorizado"]),
    tieneRide:              hasAtt(r.fields["RIDE PDF"]),
  }));

  return {
    notas,
    offset: data.offset,
    total:  notas.length,
    suma:   notas.reduce((s, n) => s + n.total, 0),
  };
}

// ─── Adjunto (XML/RIDE) de una NC por clave de acceso ────────────────────────

export type AdjuntoNotaCredito = { url: string; filename: string };

export async function obtenerAdjuntoNotaCreditoPorClave(
  claveAcceso: string,
  campo: "XML Autorizado" | "RIDE PDF"
): Promise<AdjuntoNotaCredito | null> {
  const client = getClient();
  const params = new URLSearchParams({
    filterByFormula: `{Clave de Acceso}="${claveAcceso}"`,
    maxRecords: "1",
  });
  params.append("fields[]", campo);

  const data = await airtableRequest<{ records: Array<{ fields: Record<string, unknown> }> }>(
    `${client.baseUrl}/${encodeURIComponent(TABLE)}?${params}`
  );
  if (!data.records.length) return null;
  const adj = data.records[0].fields[campo];
  if (!Array.isArray(adj) || adj.length === 0) return null;
  const primero = adj[0] as { url?: unknown; filename?: unknown };
  if (typeof primero.url !== "string") return null;
  return { url: primero.url, filename: typeof primero.filename === "string" ? primero.filename : `${claveAcceso}.${campo === "RIDE PDF" ? "pdf" : "xml"}` };
}

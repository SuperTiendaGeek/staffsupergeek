import "server-only";

import type { FacturacionConfig } from "../config";
import type { MensajeSRI } from "./recepcion";

const TIMEOUT_AUTORIZACION_MS = 30_000;

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type ResultadoAutorizacion =
  | {
      estado: "AUTORIZADO";
      numeroAutorizacion: string;
      fechaAutorizacion: string;  // ISO 8601 devuelto por el SRI
      ambiente: string;
      xmlAutorizado: string;      // XML completo con firma y nodo de autorización
      mensajes: MensajeSRI[];
      _rawSoap: string;
    }
  | {
      estado: "NO AUTORIZADO";
      mensajes: MensajeSRI[];
      _rawSoap: string;
    }
  | {
      estado: "EN PROCESAMIENTO";
      _rawSoap: string;
    };

// ─── Helpers de parseo ────────────────────────────────────────────────────────

function extractText(xml: string, tag: string): string {
  const re = new RegExp(
    `<${tag}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*?))<\\/${tag}>`,
    "i"
  );
  const m = xml.match(re);
  return (m?.[1] ?? m?.[2] ?? "").trim();
}

// CDATA puede contener XML completo; usa match no-greedy sobre el bloque del comprobante
function extractCdata(xml: string, tag: string): string {
  const re = new RegExp(
    `<${tag}(?:\\s[^>]*)?><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`,
    "i"
  );
  const m = xml.match(re);
  if (m) return m[1].trim();
  return extractText(xml, tag); // fallback si el SRI no usa CDATA
}

function extractAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "gi");
  return [...xml.matchAll(re)].map((m) => m[1]);
}

function parseMensajes(xml: string): MensajeSRI[] {
  // Same fix as recepcion.ts: outer <mensaje> contains a child <mensaje> (text field).
  // Anchor on <identificador> child and capture through </tipo> to include the inner tag.
  const results: MensajeSRI[] = [];
  const re = /<mensaje>(?=[\s\S]*?<identificador>)([\s\S]*?<\/tipo>)[\s\S]*?<\/mensaje>/g;
  for (const m of xml.matchAll(re)) {
    const block = m[1];
    const identificador = extractText(block, "identificador");
    if (!identificador) continue;
    results.push({
      identificador,
      mensaje:              extractText(block, "mensaje"),
      informacionAdicional: extractText(block, "informacionAdicional") || undefined,
      tipo: (extractText(block, "tipo") || "ERROR") as MensajeSRI["tipo"],
    });
  }
  return results;
}

function parseSoapFault(xml: string): string | undefined {
  const fault = extractText(xml, "faultstring");
  return fault || undefined;
}

function esAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

function esErrorRedFetch(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (esAbortError(err)) return false;
  if (err.message.startsWith("HTTP ")) return false;
  return err.name === "TypeError" || /fetch failed|network|dns|tls|socket/i.test(err.message);
}

function errorAutorizacionSriNoRespondio(): Error {
  return new Error(
    "El SRI no responde en este momento. La factura YA fue enviada al SRI y " +
    "NO se ha perdido; NO debes emitir otra factura por esta venta. Usa " +
    "\"⟳ Consultar estado\" en el historial más tarde."
  );
}

function errorTimeoutAutorizacion(): Error {
  return new Error(
    "Timeout (30s) al conectar con AutorizacionComprobantesOffline del SRI. " +
    "La factura YA fue enviada al SRI y NO se ha perdido; NO debes emitir otra " +
    "factura por esta venta. Usa \"⟳ Consultar estado\" en el historial más tarde."
  );
}

// ─── Construcción del envelope ────────────────────────────────────────────────

function buildEnvelope(claveAcceso: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope` +
    ` xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"` +
    ` xmlns:ec="http://ec.gob.sri.ws.autorizacion">` +
    `<soapenv:Header/>` +
    `<soapenv:Body>` +
    `<ec:autorizacionComprobante>` +
    `<claveAccesoComprobante>${claveAcceso}</claveAccesoComprobante>` +
    `</ec:autorizacionComprobante>` +
    `</soapenv:Body>` +
    `</soapenv:Envelope>`
  );
}

// ─── Cliente SOAP ─────────────────────────────────────────────────────────────

/**
 * Consulta el estado de autorización de un comprobante por su clave de acceso
 * contra el web service AutorizacionComprobantesOffline del SRI.
 *
 * - AUTORIZADO      → comprobante válido con XML y número de autorización
 * - NO AUTORIZADO   → rechazado; mensajes con código de error SRI
 * - EN PROCESAMIENTO → el SRI aún no resolvió; reintentar con backoff (ver cola.ts)
 *
 * @param claveAcceso - 49 dígitos generados con generateAccessKey()
 * @param config      - Config con endpointAutorizacion del ambiente activo
 */
export async function consultarAutorizacion(
  claveAcceso: string,
  config: Pick<FacturacionConfig, "endpointAutorizacion">
): Promise<ResultadoAutorizacion> {
  const endpoint = config.endpointAutorizacion.replace(/\?wsdl$/i, "");
  const envelope = buildEnvelope(claveAcceso);

  let body: string;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml;charset=UTF-8",
        SOAPAction: '""',
      },
      body: envelope,
      signal: AbortSignal.timeout(TIMEOUT_AUTORIZACION_MS),
    });
    body = await res.text();

    if (!res.ok && res.status !== 500) {
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
    }
  } catch (err: unknown) {
    if (esAbortError(err)) {
      throw errorTimeoutAutorizacion();
    }
    if (esErrorRedFetch(err)) {
      throw errorAutorizacionSriNoRespondio();
    }
    throw err;
  }

  const fault = parseSoapFault(body);
  if (fault) throw new Error(`SOAP Fault en autorización: ${fault}`);

  // La respuesta puede traer varias <autorizacion> (una por clave consultada).
  // Para una consulta individual siempre es una sola.
  const autorizacionBlock = extractAll(body, "autorizacion")[0] ?? body;
  const estado = extractText(autorizacionBlock, "estado") as
    | "AUTORIZADO"
    | "NO AUTORIZADO"
    | "EN PROCESAMIENTO";

  if (estado === "EN PROCESAMIENTO") {
    return { estado: "EN PROCESAMIENTO", _rawSoap: body };
  }

  const mensajes = parseMensajes(autorizacionBlock);

  if (estado === "NO AUTORIZADO") {
    return { estado: "NO AUTORIZADO", mensajes, _rawSoap: body };
  }

  // AUTORIZADO
  return {
    estado: "AUTORIZADO",
    numeroAutorizacion: extractText(autorizacionBlock, "numeroAutorizacion"),
    fechaAutorizacion:  extractText(autorizacionBlock, "fechaAutorizacion"),
    ambiente:           extractText(autorizacionBlock, "ambiente"),
    xmlAutorizado:      extractCdata(autorizacionBlock, "comprobante"),
    mensajes,
    _rawSoap: body,
  };
}

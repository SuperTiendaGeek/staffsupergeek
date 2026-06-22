import "server-only";

import type { FacturacionConfig } from "../config";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type MensajeSRI = {
  identificador: string;
  mensaje: string;
  informacionAdicional?: string;
  tipo: "ERROR" | "ADVERTENCIA";
};

export type ResultadoRecepcion =
  | { estado: "RECIBIDA"; claveAcceso: string; _rawSoap: string }
  | { estado: "DEVUELTA"; claveAcceso: string; mensajes: MensajeSRI[]; _rawSoap: string };

// ─── Helpers de parseo ────────────────────────────────────────────────────────

function extractText(xml: string, tag: string): string {
  const re = new RegExp(
    `<${tag}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*?))<\\/${tag}>`,
    "i"
  );
  const m = xml.match(re);
  return (m?.[1] ?? m?.[2] ?? "").trim();
}

function parseMensajes(xml: string): MensajeSRI[] {
  // SRI wraps each message in <mensaje> which also contains a child <mensaje> (the text field).
  // Plain extractAll breaks: the inner </mensaje> terminates the outer non-greedy match first,
  // truncating the block before the inner text is captured.
  // Fix: anchor on <identificador> child and capture up to </tipo> to include the inner tag.
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

// ─── Construcción del envelope ────────────────────────────────────────────────

function buildEnvelope(xmlBase64: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope` +
    ` xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"` +
    ` xmlns:ec="http://ec.gob.sri.ws.recepcion">` +
    `<soapenv:Header/>` +
    `<soapenv:Body>` +
    `<ec:validarComprobante>` +
    `<xml>${xmlBase64}</xml>` +
    `</ec:validarComprobante>` +
    `</soapenv:Body>` +
    `</soapenv:Envelope>`
  );
}

// ─── Cliente SOAP ─────────────────────────────────────────────────────────────

/**
 * Envía el XML firmado al web service RecepcionComprobantesOffline del SRI.
 * El XML se base64-encodes como requiere el tipo xs:base64Binary del WSDL.
 *
 * Retorna { estado: "RECIBIDA" } si el SRI aceptó el comprobante para procesamiento,
 * o { estado: "DEVUELTA", mensajes } si el XML fue rechazado con errores.
 *
 * @param xmlFirmado - XML de factura ya firmado con ds:Signature (Fase 2)
 * @param config     - Config con endpointRecepcion del ambiente activo
 */
export async function enviarComprobante(
  xmlFirmado: string,
  config: Pick<FacturacionConfig, "endpointRecepcion">
): Promise<ResultadoRecepcion> {
  const endpoint = config.endpointRecepcion.replace(/\?wsdl$/i, "");
  const xmlBase64 = Buffer.from(xmlFirmado, "utf8").toString("base64");
  const envelope = buildEnvelope(xmlBase64);

  let body: string;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml;charset=UTF-8",
        SOAPAction: '""',
      },
      body: envelope,
      signal: AbortSignal.timeout(30_000),
    });
    body = await res.text();

    // 500 con SOAP fault sigue siendo una respuesta válida para parsear
    if (!res.ok && res.status !== 500) {
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Timeout (30s) al conectar con RecepcionComprobantesOffline del SRI");
    }
    throw err;
  }

  const fault = parseSoapFault(body);
  if (fault) throw new Error(`SOAP Fault en recepción: ${fault}`);

  const estado = extractText(body, "estado") as "RECIBIDA" | "DEVUELTA";
  const claveAcceso = extractText(body, "claveAcceso");

  if (estado === "RECIBIDA") {
    return { estado: "RECIBIDA", claveAcceso, _rawSoap: body };
  }

  return { estado: "DEVUELTA", claveAcceso, mensajes: parseMensajes(body), _rawSoap: body };
}

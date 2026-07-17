import "server-only";

// Persistencia del comprobante autorizado:
//   1. Registro en Airtable ("Facturas Electrónicas")
//   2. Adjuntos XML + PDF en Airtable
//   3. Copia en disco (retención legal 7 años, RLRTI art. 96)
//
// Para comprobantes DEVUELTOS / NO AUTORIZADOS solo se crea el registro
// con el estado y los mensajes del SRI; no se consume secuencial.

import fs   from "fs";
import path from "path";

import { crearRegistroFactura, subirAdjunto, marcarAdjuntosPendientes } from "../airtable/facturas";
import { directorioBaseFacturas }             from "./directorioFacturas";
import { intentarGuardarEnBlob }              from "./blob";
import type { MensajeSRI }                    from "../sri/recepcion";
import type { AmbienteSRI }                   from "../config";

// ─── Tipos de entrada ─────────────────────────────────────────────────────────

export type DatosCliente = {
  nombre:         string;
  identificacion: string;
  correo?:        string;
};

export type DatosComprobanteOk = {
  claveAcceso:           string;
  numeroFactura:         string;   // "001-002-000000644"
  secuencial:            string;   // "000000644"
  numeroAutorizacion:    string;
  fechaAutorizacion:     string;   // ISO 8601
  fechaEmision:          Date;
  ambiente:              AmbienteSRI;
  cliente:               DatosCliente;
  subtotal:              number;
  iva:                   number;
  total:                 number;
  xmlAutorizado:         string;   // XML completo devuelto por el SRI
  ridePdf?:              Uint8Array;
  lineasJson?:           string;   // JSON serializado de los detalles de la factura
  // Fase 16 PR2 (gancho): links de origen, ausentes en facturas de mostrador.
  ordenId?:              string;
  operacionId?:          string;
  clienteId?:            string;
};

export type DatosComprobanteError = {
  claveAcceso:    string;
  numeroFactura:  string;
  secuencial:     string;
  estado:         "DEVUELTA" | "NO AUTORIZADO";
  fechaEmision:   Date;
  ambiente:       AmbienteSRI;
  cliente:        DatosCliente;
  subtotal:       number;
  iva:            number;
  total:          number;
  mensajesSri:    MensajeSRI[];
};

// ─── Directorio de respaldo en disco ─────────────────────────────────────────

function directorioRespaldo(fecha: Date): string {
  const año  = fecha.getFullYear();
  const mes  = String(fecha.getMonth() + 1).padStart(2, "0");
  return path.join(directorioBaseFacturas(), String(año), mes);
}

function guardarEnDisco(
  clave:    string,
  fecha:    Date,
  xml:      string,
  pdf?:     Uint8Array
): void {
  const dir = directorioRespaldo(fecha);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${clave}.xml`), xml, "utf8");
  if (pdf) fs.writeFileSync(path.join(dir, `${clave}.pdf`), pdf);
}

/**
 * Intenta el respaldo en disco sin dejar que su fallo tumbe la emisión: la
 * factura ya está AUTORIZADA por el SRI en este punto (persistirAutorizado()
 * corre después de esperarAutorizacion()) — un entorno sin filesystem
 * persistente (Vercel: solo lectura fuera de /tmp) no debe perder ese
 * comprobante fiscal real por no poder escribir la copia de respaldo.
 *
 * Devuelve `undefined` si el respaldo se guardó bien, o un MensajeSRI[] con
 * la advertencia (para dejar constancia visible en "Mensajes SRI", igual
 * que hace marcarAdjuntosPendientes() para adjuntos) si falló.
 */
export function intentarGuardarEnDisco(
  clave: string,
  fecha: Date,
  xml:   string,
  pdf?:  Uint8Array
): MensajeSRI[] | undefined {
  try {
    guardarEnDisco(clave, fecha, xml, pdf);
    return undefined;
  } catch (err) {
    console.error(
      `[repositorio] Respaldo en disco falló para ${clave} (factura ya AUTORIZADA por el SRI):`,
      err
    );
    return [{
      identificador:        "RESPALDO_DISCO",
      tipo:                 "ADVERTENCIA",
      mensaje:              "No se pudo guardar el respaldo legal en disco",
      informacionAdicional: err instanceof Error ? err.message : String(err),
    }];
  }
}

// ─── Persistir comprobante AUTORIZADO ────────────────────────────────────────

export async function persistirAutorizado(datos: DatosComprobanteOk): Promise<string> {
  // 1a. Disco — best-effort (ver intentarGuardarEnDisco). Antes era un paso
  //     fatal síncrono que abortaba toda la persistencia si fallaba, dejando
  //     una factura ya AUTORIZADA sin ningún rastro ni en disco ni en Airtable.
  //     Sigue existiendo como copia rápida local, pero YA NO es la única
  //     copia "propia" (fuera de Airtable) — ver 1b.
  const mensajesDisco = intentarGuardarEnDisco(
    datos.claveAcceso, datos.fechaEmision, datos.xmlAutorizado, datos.ridePdf
  );

  // 1b. Vercel Blob — best-effort, EN PARALELO al disco (Fase 17). A
  //     diferencia del disco, esta copia sí sobrevive a un despliegue nuevo
  //     — es el respaldo que de verdad cumple la retención legal de 7 años
  //     sin depender de que el adjunto de Airtable se haya subido bien.
  const mensajesBlob = await intentarGuardarEnBlob(
    datos.claveAcceso, datos.fechaEmision, datos.xmlAutorizado, datos.ridePdf
  );

  const mensajesRespaldo = [...(mensajesDisco ?? []), ...(mensajesBlob ?? [])];

  // 2. Crear registro en Airtable
  const recordId = await crearRegistroFactura({
    claveAcceso:           datos.claveAcceso,
    numeroFactura:         datos.numeroFactura,
    secuencial:            datos.secuencial,
    estado:                "AUTORIZADO",
    numeroAutorizacion:    datos.numeroAutorizacion,
    fechaAutorizacion:     datos.fechaAutorizacion,
    fechaEmision:          datos.fechaEmision.toISOString(),
    ambiente:              datos.ambiente,
    clienteNombre:         datos.cliente.nombre,
    clienteIdentificacion: datos.cliente.identificacion,
    clienteCorreo:         datos.cliente.correo,
    subtotal:              datos.subtotal,
    iva:                   datos.iva,
    total:                 datos.total,
    lineasJson:            datos.lineasJson,
    mensajesSri:           mensajesRespaldo,
    ordenId:               datos.ordenId,
    operacionId:           datos.operacionId,
    clienteId:             datos.clienteId,
  });

  // 3. Subir adjuntos; si falla, NO eliminar la fila — el comprobante ya está
  //    en disco y la fila queda marcada para re-sincronizar después.
  try {
    const xmlB64 = Buffer.from(datos.xmlAutorizado, "utf8").toString("base64");
    await subirAdjunto(recordId, "XML Autorizado", `${datos.claveAcceso}.xml`, "text/xml", xmlB64);

    if (datos.ridePdf) {
      const pdfB64 = Buffer.from(datos.ridePdf).toString("base64");
      await subirAdjunto(recordId, "RIDE PDF", `${datos.claveAcceso}.pdf`, "application/pdf", pdfB64);
    }
  } catch (err) {
    console.error("[repositorio] Adjuntos no subidos a Airtable:", err);
    await marcarAdjuntosPendientes(recordId).catch((e) => {
      console.error("[repositorio] No se pudo marcar adjunto pendiente:", e);
    });
    // No re-lanzamos: la factura está autorizada y en disco; Airtable es recuperable.
  }

  return recordId;
}

// ─── Registrar intento fallido (DEVUELTA / NO AUTORIZADO) ────────────────────

export async function registrarIntento(datos: DatosComprobanteError): Promise<string> {
  return crearRegistroFactura({
    claveAcceso:           datos.claveAcceso,
    numeroFactura:         datos.numeroFactura,
    secuencial:            datos.secuencial,
    estado:                datos.estado,
    fechaEmision:          datos.fechaEmision.toISOString(),
    ambiente:              datos.ambiente,
    clienteNombre:         datos.cliente.nombre,
    clienteIdentificacion: datos.cliente.identificacion,
    clienteCorreo:         datos.cliente.correo,
    subtotal:              datos.subtotal,
    iva:                   datos.iva,
    total:                 datos.total,
    mensajesSri:           datos.mensajesSri,
  });
}

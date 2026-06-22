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

import { crearRegistroFactura, subirAdjunto, eliminarRegistroFactura } from "../airtable/facturas";
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
  const base = process.env.FACTURAS_DIR?.trim() || "facturas-autorizadas";
  const año  = fecha.getFullYear();
  const mes  = String(fecha.getMonth() + 1).padStart(2, "0");
  return path.join(process.cwd(), base, String(año), mes);
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

// ─── Persistir comprobante AUTORIZADO ────────────────────────────────────────

export async function persistirAutorizado(datos: DatosComprobanteOk): Promise<string> {
  // 1. Crear registro en Airtable
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
  });

  // 2. Subir adjuntos; si falla, eliminar el registro para no dejar filas a medias
  try {
    const xmlB64 = Buffer.from(datos.xmlAutorizado, "utf8").toString("base64");
    await subirAdjunto(recordId, "XML Autorizado", `${datos.claveAcceso}.xml`, "text/xml", xmlB64);

    if (datos.ridePdf) {
      const pdfB64 = Buffer.from(datos.ridePdf).toString("base64");
      await subirAdjunto(recordId, "RIDE PDF", `${datos.claveAcceso}.pdf`, "application/pdf", pdfB64);
    }
  } catch (err) {
    await eliminarRegistroFactura(recordId).catch((delErr) => {
      console.error("[repositorio] No se pudo revertir el registro:", delErr);
    });
    throw err;
  }

  // 3. Guardar copia en disco (respaldo legal 7 años)
  guardarEnDisco(datos.claveAcceso, datos.fechaEmision, datos.xmlAutorizado, datos.ridePdf);

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

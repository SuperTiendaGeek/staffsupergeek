import "server-only";

// Recupera un comprobante autorizado a partir de su clave de acceso:
//   1. Consulta al SRI para obtener el XML autorizado
//   2. Parsea los datos del comprobante desde el XML firmado
//   3. Guarda en disco si no existe (respaldo legal)
//   4. Genera el RIDE PDF
//   5. Crea el registro en Airtable si no existe
//   6. Sube los adjuntos XML + RIDE
//
// Útil para facturas que quedaron autorizadas por el SRI pero
// no persistieron correctamente (p.ej. falló la subida a Airtable).

import fs   from "fs";
import path from "path";

import { consultarAutorizacion }                              from "../sri/autorizacion";
import { getFacturacionConfig }                               from "../config";
import { buscarFacturaPorClave, crearRegistroFactura,
         subirAdjunto, marcarAdjuntosPendientes }             from "../airtable/facturas";
import { generarRide }                                        from "../ride/generarRide";
import type { DetalleRide }                                   from "../ride/generarRide";
import type { TotalImpuesto, Pago, CampoAdicional }          from "../types/factura";

// ─── Decode HTML entities ─────────────────────────────────────────────────────
// El SRI devuelve el comprobante como texto plano con entidades HTML (&lt; etc.)
// dentro del elemento <comprobante>, no como CDATA. Hay que decodificar antes
// de parsear como XML.

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g,   "<")
    .replace(/&gt;/g,   ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g,  "&");   // &amp; al final para no romper &amp;lt; etc.
}

// ─── Utilidades de parseo XML (sin dependencias externas) ─────────────────────

function xt(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)<\\/${tag}>`, "i"));
  return (m?.[1] ?? "").trim();
}

function allBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "gi");
  return [...xml.matchAll(re)].map((m) => m[1]);
}

const TARIFA_PCT: Record<string, number> = { "4": 15, "10": 15, "2": 12, "1": 0, "0": 0 };

// ─── Tipos internos ───────────────────────────────────────────────────────────

type ImpuestoDetalleRaw = {
  codigo:           string;
  codigoPorcentaje: string;
  tarifa:           number;
  baseImponible:    number;
  valor:            number;
};

type DatosDetalle = {
  codigo?:               string;
  descripcion:           string;
  unidadMedida?:         string;
  cantidad:              number;
  precioUnitario:        number;
  descuento:             number;
  precioTotalSinImpuesto:number;
  impuestos:             ImpuestoDetalleRaw[];
};

type DatosComprobante = {
  secuencial:         string;
  estab:              string;
  ptoEmi:             string;
  ambiente:           "1" | "2";
  claveAcceso:        string;
  numeroFactura:      string;
  fechaEmision:       Date;
  fechaEmisionIso:    string;     // "YYYY-MM-DD"
  tipoIdentificacion: string;
  razonSocialComp:    string;
  identificacion:     string;
  correo:             string;
  totalSinImpuestos:  number;
  totalDescuento:     number;
  importeTotal:       number;
  totalConImpuestos:  TotalImpuesto[];
  iva:                number;
  pagos:              Pago[];
  formaPago:          string;
  detalles:           DatosDetalle[];
  infoAdicional:      CampoAdicional[];
};

// ─── Parser del XML del comprobante ──────────────────────────────────────────

function parsearComprobanteXml(xml: string): DatosComprobante {
  const infoTrib = xml.match(/<infoTributaria>([\s\S]*?)<\/infoTributaria>/i)?.[1] ?? "";
  const infoFact = xml.match(/<infoFactura>([\s\S]*?)<\/infoFactura>/i)?.[1] ?? "";

  const secuencial    = xt(infoTrib, "secuencial");
  const estab         = xt(infoTrib, "estab");
  const ptoEmi        = xt(infoTrib, "ptoEmi");
  const ambiente      = (xt(infoTrib, "ambiente") || "1") as "1" | "2";
  const claveAcceso   = xt(infoTrib, "claveAcceso");
  const numeroFactura = `${estab}-${ptoEmi}-${secuencial}`;

  // SRI fecha: "DD/MM/YYYY" → ISO "YYYY-MM-DD"
  const fechaRaw        = xt(infoFact, "fechaEmision");
  const [dd, mm, aaaa]  = fechaRaw.split("/");
  const fechaEmisionIso = `${aaaa}-${mm}-${dd}`;
  const fechaEmision    = new Date(`${aaaa}-${mm}-${dd}T12:00:00Z`);

  const tipoIdentificacion = xt(infoFact, "tipoIdentificacionComprador");
  const razonSocialComp    = xt(infoFact, "razonSocialComprador");
  const identificacion     = xt(infoFact, "identificacionComprador");
  const correoXml          = xt(infoFact, "correoComprador");

  const totalSinImpuestos  = parseFloat(xt(infoFact, "totalSinImpuestos")) || 0;
  const totalDescuento     = parseFloat(xt(infoFact, "totalDescuento"))    || 0;
  const importeTotal       = parseFloat(xt(infoFact, "importeTotal"))      || 0;

  // totalConImpuestos
  const tcBlock            = xml.match(/<totalConImpuestos>([\s\S]*?)<\/totalConImpuestos>/i)?.[1] ?? "";
  const tiBlocks           = allBlocks(tcBlock, "totalImpuesto");
  const totalConImpuestos: TotalImpuesto[] = tiBlocks.map((b) => {
    const cp = xt(b, "codigoPorcentaje");
    return {
      codigo:           (xt(b, "codigo") || "2") as "2" | "3" | "5",
      codigoPorcentaje: cp,
      baseImponible:    parseFloat(xt(b, "baseImponible")) || 0,
      tarifa:           TARIFA_PCT[cp] ?? 0,
      valor:            parseFloat(xt(b, "valor")) || 0,
    };
  });
  const iva = totalConImpuestos.reduce((s, t) => s + t.valor, 0);

  // pagos
  const pagosBlock  = xml.match(/<pagos>([\s\S]*?)<\/pagos>/i)?.[1] ?? "";
  const pagoBlocks  = allBlocks(pagosBlock, "pago");
  const pagos: Pago[] = pagoBlocks.map((b) => ({
    formaPago: xt(b, "formaPago"),
    total:     parseFloat(xt(b, "total")) || 0,
  }));
  const formaPago   = pagos[0]?.formaPago ?? "01";

  // detalles
  const detallesBlock = xml.match(/<detalles>([\s\S]*?)<\/detalles>/i)?.[1] ?? "";
  const detalleBlks   = allBlocks(detallesBlock, "detalle");
  const detalles: DatosDetalle[] = detalleBlks.map((b) => {
    const impBlock = b.match(/<impuestos>([\s\S]*?)<\/impuestos>/i)?.[1] ?? "";
    const impBlks  = allBlocks(impBlock, "impuesto");
    const impuestos: ImpuestoDetalleRaw[] = impBlks.map((ib) => ({
      codigo:           xt(ib, "codigo") || "2",
      codigoPorcentaje: xt(ib, "codigoPorcentaje"),
      tarifa:           parseFloat(xt(ib, "tarifa")) || 0,
      baseImponible:    parseFloat(xt(ib, "baseImponible")) || 0,
      valor:            parseFloat(xt(ib, "valor")) || 0,
    }));
    const codigoVal   = xt(b, "codigoPrincipal");
    const unidadVal   = xt(b, "unidadMedida");
    return {
      codigo:               codigoVal   || undefined,
      descripcion:          xt(b, "descripcion"),
      unidadMedida:         unidadVal   || undefined,
      cantidad:             parseFloat(xt(b, "cantidad"))               || 0,
      precioUnitario:       parseFloat(xt(b, "precioUnitario"))         || 0,
      descuento:            parseFloat(xt(b, "descuento"))              || 0,
      precioTotalSinImpuesto: parseFloat(xt(b, "precioTotalSinImpuesto")) || 0,
      impuestos,
    };
  });

  // infoAdicional
  const iaBlock     = xml.match(/<infoAdicional>([\s\S]*?)<\/infoAdicional>/i)?.[1] ?? "";
  const infoAdicional: CampoAdicional[] = [];
  const caRe = /<campoAdicional\s+nombre="([^"]*)"[^>]*>([^<]*)<\/campoAdicional>/gi;
  let m: RegExpExecArray | null;
  while ((m = caRe.exec(iaBlock)) !== null) {
    infoAdicional.push({ nombre: m[1], valor: m[2].trim() });
  }

  const correo = correoXml
    || infoAdicional.find((c) => /correo/i.test(c.nombre))?.valor
    || "";

  return {
    secuencial, estab, ptoEmi, ambiente, claveAcceso, numeroFactura,
    fechaEmision, fechaEmisionIso,
    tipoIdentificacion, razonSocialComp, identificacion, correo,
    totalSinImpuestos, totalDescuento, importeTotal,
    totalConImpuestos, iva,
    pagos, formaPago,
    detalles,
    infoAdicional,
  };
}

// ─── Guardar en disco ─────────────────────────────────────────────────────────

function guardarEnDisco(clave: string, fecha: Date, xml: string, pdf?: Uint8Array): void {
  const base = process.env.FACTURAS_DIR?.trim() || "facturas-autorizadas";
  const año  = fecha.getFullYear();
  const mes  = String(fecha.getMonth() + 1).padStart(2, "0");
  const dir  = path.join(process.cwd(), base, String(año), mes);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${clave}.xml`), xml, "utf8");
  if (pdf) fs.writeFileSync(path.join(dir, `${clave}.pdf`), pdf);
}

// ─── Recuperar factura autorizada ────────────────────────────────────────────

export type ResultadoRecuperacion = {
  recordId:        string;
  enDisco:         boolean;
  enAirtable:      boolean;   // true si ya existía antes de esta llamada
  adjuntosSubidos: boolean;
  numeroFactura:   string;
};

export async function recuperarFacturaAutorizadaPorClave(
  claveAcceso: string
): Promise<ResultadoRecuperacion> {
  const cfg = getFacturacionConfig();

  // 1. Consultar al SRI
  const autorizacion = await consultarAutorizacion(claveAcceso, cfg);
  if (autorizacion.estado !== "AUTORIZADO") {
    throw new Error(
      `La factura con clave ${claveAcceso} no está AUTORIZADA en el SRI (estado: ${autorizacion.estado})`
    );
  }

  // El SRI devuelve el comprobante con entidades HTML; decodificar para parsear.
  // Se guarda en disco la versión original (entity-encoded) para consistencia
  // con el resto de facturas ya guardadas.
  const xmlAutorizado = autorizacion.xmlAutorizado;
  const xmlDecoded    = decodeXmlEntities(xmlAutorizado);
  const datos         = parsearComprobanteXml(xmlDecoded);

  // 2. Guardar XML en disco (invariante de integridad primero)
  const base    = process.env.FACTURAS_DIR?.trim() || "facturas-autorizadas";
  const año     = datos.fechaEmision.getFullYear();
  const mes     = String(datos.fechaEmision.getMonth() + 1).padStart(2, "0");
  const xmlPath = path.join(process.cwd(), base, String(año), mes, `${claveAcceso}.xml`);
  const yaEnDisco = fs.existsSync(xmlPath);
  if (!yaEnDisco) {
    guardarEnDisco(claveAcceso, datos.fechaEmision, xmlAutorizado);
  }
  const enDisco = true;

  // 3. Generar RIDE (no lanzar si falla — el XML es lo crítico)
  let ridePdf: Uint8Array | undefined;
  try {
    const detallesRide: DetalleRide[] = datos.detalles.map((d) => ({
      codigo:         d.codigo,
      descripcion:    d.descripcion,
      unidadMedida:   d.unidadMedida,
      cantidad:       d.cantidad,
      precioUnitario: d.precioUnitario,
      descuento:      d.descuento,
      total:          d.precioTotalSinImpuesto,
    }));

    ridePdf = await generarRide({
      ruc:                  cfg.ruc,
      razonSocial:          cfg.razonSocial,
      nombreComercial:      cfg.nombreComercial,
      dirMatriz:            cfg.dirMatriz,
      dirEstablecimiento:   cfg.dirEstablecimiento,
      obligadoContabilidad: cfg.obligadoContabilidad,
      claveAcceso,
      ambiente:             datos.ambiente,
      numeroFactura:        datos.numeroFactura,
      fechaEmision:         datos.fechaEmision,
      numeroAutorizacion:   autorizacion.numeroAutorizacion,
      fechaAutorizacion:    autorizacion.fechaAutorizacion,
      tipoIdentificacion:   datos.tipoIdentificacion,
      identificacion:       datos.identificacion,
      razonSocialComprador: datos.razonSocialComp,
      totalConImpuestos:    datos.totalConImpuestos,
      totalSinImpuestos:    datos.totalSinImpuestos,
      totalDescuento:       datos.totalDescuento,
      total:                datos.importeTotal,
      pagos:                datos.pagos,
      detalles:             detallesRide,
      infoAdicional:        datos.infoAdicional.length ? datos.infoAdicional : undefined,
    });

    // Guardar RIDE en disco también
    const dir = path.join(process.cwd(), base, String(año), mes);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${claveAcceso}.pdf`), ridePdf);
  } catch (rideErr) {
    console.error("[recuperar] No se pudo generar el RIDE:", rideErr);
  }

  // 4. Verificar si ya existe en Airtable
  const existente  = await buscarFacturaPorClave(claveAcceso);
  const enAirtable = !!existente;
  let recordId     = existente?.recordId ?? "";

  const lineasJson = JSON.stringify({
    version:       2,
    detalles:      datos.detalles.map((d) => ({
      codigoPrincipal:        d.codigo || undefined,
      descripcion:            d.descripcion,
      unidadMedida:           d.unidadMedida || undefined,
      cantidad:               d.cantidad,
      precioUnitario:         d.precioUnitario,
      descuento:              d.descuento,
      precioTotalSinImpuesto: d.precioTotalSinImpuesto,
      impuestos:              d.impuestos,
    })),
    formaPago:     datos.formaPago,
    infoAdicional: datos.infoAdicional.length ? datos.infoAdicional : undefined,
  });

  // 5. Crear registro en Airtable si no existe
  if (!existente) {
    recordId = await crearRegistroFactura({
      claveAcceso,
      numeroFactura:         datos.numeroFactura,
      secuencial:            datos.secuencial,
      estado:                "AUTORIZADO",
      numeroAutorizacion:    autorizacion.numeroAutorizacion,
      fechaAutorizacion:     autorizacion.fechaAutorizacion,
      fechaEmision:          datos.fechaEmisionIso,
      ambiente:              datos.ambiente,
      clienteNombre:         datos.razonSocialComp,
      clienteIdentificacion: datos.identificacion,
      clienteCorreo:         datos.correo || undefined,
      subtotal:              datos.totalSinImpuestos,
      iva:                   datos.iva,
      total:                 datos.importeTotal,
      lineasJson,
    });
  }

  // 6. Subir adjuntos
  let adjuntosSubidos = false;
  try {
    const xmlB64 = Buffer.from(xmlAutorizado, "utf8").toString("base64");
    await subirAdjunto(recordId, "XML Autorizado", `${claveAcceso}.xml`, "text/xml", xmlB64);

    if (ridePdf) {
      const pdfB64 = Buffer.from(ridePdf).toString("base64");
      await subirAdjunto(recordId, "RIDE PDF", `${claveAcceso}.pdf`, "application/pdf", pdfB64);
    }
    adjuntosSubidos = true;
  } catch (adjErr) {
    console.error("[recuperar] Error subiendo adjuntos a Airtable:", adjErr);
    await marcarAdjuntosPendientes(recordId).catch(() => {});
  }

  return {
    recordId,
    enDisco,
    enAirtable,
    adjuntosSubidos,
    numeroFactura: datos.numeroFactura,
  };
}

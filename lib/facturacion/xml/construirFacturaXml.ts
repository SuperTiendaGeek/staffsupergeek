import "server-only";

import type {
  FacturaInput,
  FacturaXml,
  TotalImpuesto,
  DetalleFactura,
  Pago,
  Compensacion,
  ReembolsoDetalle,
} from "../types/factura";

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Normaliza texto libre que viene de fuentes externas (Airtable, formulario)
// antes de insertarlo en el XML. Elimina caracteres que pueden corromper la firma
// XAdES-BES al causar discrepancias en el round-trip XML→DOM→XML del firmador.
function normalizeXmlText(s: string): string {
  return String(s)
    // Comillas tipográficas → ASCII equivalente (evita chars multi-byte inesperados)
    .replace(/[“”ʺ＂]/g, '"')
    .replace(/[‘’ʼ＇]/g, "'")
    // Espacios especiales → espacio normal
    .replace(/[     　]/g, " ")
    // Chars invisibles sin ancho → eliminar
    .replace(/[​‌‍﻿­]/g, "")
    // Control chars inválidos en XML 1.0 (excepto \t \n \r que son válidos)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    // CR y CRLF → espacio (nombres de producto deben ser una sola línea)
    .replace(/\r\n?/g, " ")
    // LF y tabs → espacio
    .replace(/[\n\t]/g, " ")
    // Colapsar espacios múltiples
    .replace(/ {2,}/g, " ")
    .trim();
}

// Escape para ATRIBUTOS XML: escapa &, <, >, " y '
function esc(v: string | number): string {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Escape para CONTENIDO DE TEXTO XML: solo escapa & y < (mínimo necesario).
// NO escapa " ni ' porque no es requerido en texto de elementos, y hacerlo
// puede causar discrepancias en el round-trip parser/serializer del firmador XAdES.
function escText(v: string | number): string {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;");
}

// Para campos de texto libre (formulario / Airtable): normalizar + escape texto
function escFree(v: string): string {
  return escText(normalizeXmlText(v));
}

const dec = (n: number) => n.toFixed(2);

function pad(s: string | number, len: number): string {
  return String(s).padStart(len, "0");
}

function fechaDDMMAAAA(d: Date): string {
  return `${pad(d.getDate(), 2)}/${pad(d.getMonth() + 1, 2)}/${d.getFullYear()}`;
}

function optEl(tag: string, value: string | number | undefined): string {
  if (value === undefined || value === null) return "";
  return `<${tag}>${esc(value)}</${tag}>`;
}

function optDec(tag: string, value: number | undefined): string {
  if (value === undefined || value === null) return "";
  return `<${tag}>${dec(value)}</${tag}>`;
}

// ─── Builders de sub-estructuras ─────────────────────────────────────────────

function buildTotalImpuesto(t: TotalImpuesto): string {
  return (
    `<totalImpuesto>` +
    `<codigo>${esc(t.codigo)}</codigo>` +
    `<codigoPorcentaje>${esc(t.codigoPorcentaje)}</codigoPorcentaje>` +
    optDec("descuentoAdicional", t.descuentoAdicional) +
    `<baseImponible>${dec(t.baseImponible)}</baseImponible>` +
    optDec("tarifa", t.tarifa) +
    `<valor>${dec(t.valor)}</valor>` +
    optDec("valorDevolucionIva", t.valorDevolucionIva) +
    `</totalImpuesto>`
  );
}

function buildCompensacion(c: Compensacion): string {
  return (
    `<compensacion>` +
    `<codigo>${esc(c.codigo)}</codigo>` +
    `<tarifa>${dec(c.tarifa)}</tarifa>` +
    `<valor>${dec(c.valor)}</valor>` +
    `</compensacion>`
  );
}

function buildPago(p: Pago): string {
  return (
    `<pago>` +
    `<formaPago>${esc(p.formaPago)}</formaPago>` +
    `<total>${dec(p.total)}</total>` +
    optDec("plazo", p.plazo) +
    optEl("unidadTiempo", p.unidadTiempo) +
    `</pago>`
  );
}

function buildDetalle(d: DetalleFactura): string {
  // codigoPrincipal/Auxiliar y descripcion vienen de Airtable o del formulario:
  // usar escFree() para normalizar + escapar como texto (sin &quot; innecesario).
  const codigoPrincipal  = d.codigoPrincipal  ? normalizeXmlText(d.codigoPrincipal)  : undefined;
  const codigoAuxiliar   = d.codigoAuxiliar   ? normalizeXmlText(d.codigoAuxiliar)   : undefined;
  const descripcion      = escFree(d.descripcion);
  const unidadMedida     = d.unidadMedida     ? normalizeXmlText(d.unidadMedida)     : undefined;

  let xml =
    `<detalle>` +
    (codigoPrincipal !== undefined ? `<codigoPrincipal>${escText(codigoPrincipal)}</codigoPrincipal>` : "") +
    (codigoAuxiliar  !== undefined ? `<codigoAuxiliar>${escText(codigoAuxiliar)}</codigoAuxiliar>`   : "") +
    `<descripcion>${descripcion}</descripcion>` +
    (unidadMedida    !== undefined ? `<unidadMedida>${escText(unidadMedida)}</unidadMedida>`         : "") +
    `<cantidad>${dec(d.cantidad)}</cantidad>` +
    `<precioUnitario>${dec(d.precioUnitario)}</precioUnitario>` +
    optDec("precioSinSubsidio", d.precioSinSubsidio) +
    `<descuento>${dec(d.descuento)}</descuento>` +
    `<precioTotalSinImpuesto>${dec(d.precioTotalSinImpuesto)}</precioTotalSinImpuesto>`;

  if (d.detallesAdicionales && d.detallesAdicionales.length > 0) {
    xml += `<detallesAdicionales>`;
    for (const da of d.detallesAdicionales.slice(0, 3)) {
      xml += `<detAdicional nombre="${esc(da.nombre)}" valor="${esc(da.valor)}"/>`;
    }
    xml += `</detallesAdicionales>`;
  }

  xml += `<impuestos>`;
  for (const imp of d.impuestos) {
    xml +=
      `<impuesto>` +
      `<codigo>${esc(imp.codigo)}</codigo>` +
      `<codigoPorcentaje>${esc(imp.codigoPorcentaje)}</codigoPorcentaje>` +
      `<tarifa>${dec(imp.tarifa)}</tarifa>` +
      `<baseImponible>${dec(imp.baseImponible)}</baseImponible>` +
      `<valor>${dec(imp.valor)}</valor>` +
      `</impuesto>`;
  }
  xml += `</impuestos></detalle>`;
  return xml;
}

function buildReembolso(r: ReembolsoDetalle): string {
  return (
    `<reembolsoDetalle>` +
    `<tipoIdentificacionProveedorReembolso>${esc(r.tipoIdentificacionProveedorReembolso)}</tipoIdentificacionProveedorReembolso>` +
    `<identificacionProveedorReembolso>${esc(r.identificacionProveedorReembolso)}</identificacionProveedorReembolso>` +
    optEl("codPaisPagoProveedorReembolso", r.codPaisPagoProveedorReembolso) +
    `<tipoProveedorReembolso>${esc(r.tipoProveedorReembolso)}</tipoProveedorReembolso>` +
    `<codDocReembolso>${esc(r.codDocReembolso)}</codDocReembolso>` +
    `<estabDocReembolso>${esc(r.estabDocReembolso)}</estabDocReembolso>` +
    `<ptoEmiDocReembolso>${esc(r.ptoEmiDocReembolso)}</ptoEmiDocReembolso>` +
    `<secuencialDocReembolso>${esc(r.secuencialDocReembolso)}</secuencialDocReembolso>` +
    `<fechaEmisionDocReembolso>${esc(r.fechaEmisionDocReembolso)}</fechaEmisionDocReembolso>` +
    `<numeroautorizacionDocReemb>${esc(r.numeroautorizacionDocReemb)}</numeroautorizacionDocReemb>` +
    `<detalleImpuestos>` +
    r.detalleImpuestos.map(
      (di) =>
        `<detalleImpuesto>` +
        `<codigo>${esc(di.codigo)}</codigo>` +
        `<codigoPorcentaje>${esc(di.codigoPorcentaje)}</codigoPorcentaje>` +
        `<tarifa>${esc(di.tarifa)}</tarifa>` +
        `<baseImponibleReembolso>${dec(di.baseImponibleReembolso)}</baseImponibleReembolso>` +
        `<impuestoReembolso>${dec(di.impuestoReembolso)}</impuestoReembolso>` +
        `</detalleImpuesto>`
    ).join("") +
    `</detalleImpuestos>` +
    `</reembolsoDetalle>`
  );
}

// ─── Función principal ───────────────────────────────────────────────────────

/**
 * Convierte un FacturaInput en XML conforme al XSD SRI Factura v2.1.0.
 * El orden de los elementos sigue estrictamente la secuencia del XSD.
 * No incluye firma (ds:Signature) — se añade en Fase 2.
 */
export function construirFacturaXml(input: FacturaInput): FacturaXml {
  const codDoc = input.codDoc ?? "01";
  const secuencial = pad(input.secuencial.replace(/\D/g, ""), 9);

  let xml = `<?xml version="1.0" encoding="UTF-8"?>`;
  xml += `<factura id="comprobante" version="2.0.0">`;

  // ── infoTributaria ──────────────────────────────────────────────────────
  xml += `<infoTributaria>`;
  xml += `<ambiente>${esc(input.ambiente)}</ambiente>`;
  xml += `<tipoEmision>${esc(input.tipoEmision ?? "1")}</tipoEmision>`;
  xml += `<razonSocial>${esc(input.razonSocial)}</razonSocial>`;
  xml += optEl("nombreComercial", input.nombreComercial);
  xml += `<ruc>${esc(input.ruc)}</ruc>`;
  xml += `<claveAcceso>${esc(input.claveAcceso)}</claveAcceso>`;
  xml += `<codDoc>${esc(codDoc)}</codDoc>`;
  xml += `<estab>${esc(pad(input.estab, 3))}</estab>`;
  xml += `<ptoEmi>${esc(pad(input.ptoEmi, 3))}</ptoEmi>`;
  xml += `<secuencial>${esc(secuencial)}</secuencial>`;
  xml += `<dirMatriz>${esc(input.dirMatriz)}</dirMatriz>`;
  xml += `</infoTributaria>`;

  // ── infoFactura ─────────────────────────────────────────────────────────
  xml += `<infoFactura>`;
  xml += `<fechaEmision>${esc(fechaDDMMAAAA(input.fechaEmision))}</fechaEmision>`;
  xml += optEl("dirEstablecimiento", input.dirEstablecimiento);
  xml += optEl("contribuyenteEspecial", input.contribuyenteEspecial);
  xml += optEl("obligadoContabilidad", input.obligadoContabilidad);
  // comercio exterior (orden XSD)
  xml += optEl("comercioExterior", input.comercioExterior);
  xml += optEl("incoTermFactura", input.incoTermFactura);
  xml += optEl("lugarIncoTerm", input.lugarIncoTerm);
  xml += optEl("paisOrigen", input.paisOrigen);
  xml += optEl("puertoEmbarque", input.puertoEmbarque);
  xml += optEl("puertoDestino", input.puertoDestino);
  xml += optEl("paisDestino", input.paisDestino);
  xml += optEl("paisAdquisicion", input.paisAdquisicion);
  // comprador
  xml += `<tipoIdentificacionComprador>${esc(input.tipoIdentificacionComprador)}</tipoIdentificacionComprador>`;
  xml += optEl("guiaRemision", input.guiaRemision);
  xml += `<razonSocialComprador>${escFree(input.razonSocialComprador)}</razonSocialComprador>`;
  xml += `<identificacionComprador>${escText(input.identificacionComprador)}</identificacionComprador>`;
  xml += optEl("direccionComprador", input.direccionComprador);
  // totales
  xml += `<totalSinImpuestos>${dec(input.totalSinImpuestos)}</totalSinImpuestos>`;
  xml += optDec("totalSubsidio", input.totalSubsidio);
  xml += optEl("incoTermTotalSinImpuestos", input.incoTermTotalSinImpuestos);
  xml += `<totalDescuento>${dec(input.totalDescuento)}</totalDescuento>`;
  // reembolso cabecera
  xml += optEl("codDocReembolso", input.codDocReembolso);
  xml += optDec("totalComprobantesReembolso", input.totalComprobantesReembolso);
  xml += optDec("totalBaseImponibleReembolso", input.totalBaseImponibleReembolso);
  xml += optDec("totalImpuestoReembolso", input.totalImpuestoReembolso);
  // totalConImpuestos
  xml += `<totalConImpuestos>`;
  for (const t of input.totalConImpuestos) xml += buildTotalImpuesto(t);
  xml += `</totalConImpuestos>`;
  // compensaciones
  if (input.compensaciones?.length) {
    xml += `<compensaciones>`;
    for (const c of input.compensaciones) xml += buildCompensacion(c);
    xml += `</compensaciones>`;
  }
  xml += optDec("propina", input.propina);
  xml += optDec("fleteInternacional", input.fleteInternacional);
  xml += optDec("seguroInternacional", input.seguroInternacional);
  xml += optDec("gastosAduaneros", input.gastosAduaneros);
  xml += optDec("gastosTransporteOtros", input.gastosTransporteOtros);
  xml += `<importeTotal>${dec(input.importeTotal)}</importeTotal>`;
  xml += optEl("moneda", input.moneda);
  // pagos
  if (input.pagos?.length) {
    xml += `<pagos>`;
    for (const p of input.pagos) xml += buildPago(p);
    xml += `</pagos>`;
  }
  xml += optDec("valorRetIva", input.valorRetIva);
  xml += optDec("valorRetRenta", input.valorRetRenta);
  xml += `</infoFactura>`;

  // ── detalles ────────────────────────────────────────────────────────────
  xml += `<detalles>`;
  for (const d of input.detalles) xml += buildDetalle(d);
  xml += `</detalles>`;

  // ── reembolsos (opcional) ───────────────────────────────────────────────
  if (input.reembolsos?.length) {
    xml += `<reembolsos>`;
    for (const r of input.reembolsos) xml += buildReembolso(r);
    xml += `</reembolsos>`;
  }

  // ── otrosRubrosTerceros (opcional) ──────────────────────────────────────
  if (input.otrosRubrosTerceros?.length) {
    xml += `<otrosRubrosTerceros>`;
    for (const r of input.otrosRubrosTerceros) {
      xml +=
        `<rubro>` +
        `<concepto>${esc(r.concepto)}</concepto>` +
        `<total>${dec(r.total)}</total>` +
        `</rubro>`;
    }
    xml += `</otrosRubrosTerceros>`;
  }

  // ── infoAdicional (opcional, máx 15 campos) ─────────────────────────────
  if (input.infoAdicional?.length) {
    xml += `<infoAdicional>`;
    for (const c of input.infoAdicional.slice(0, 15)) {
      xml += `<campoAdicional nombre="${esc(normalizeXmlText(c.nombre))}">${escFree(c.valor)}</campoAdicional>`;
    }
    xml += `</infoAdicional>`;
  }

  xml += `</factura>`;
  return xml;
}

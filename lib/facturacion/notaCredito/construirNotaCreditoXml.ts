import "server-only";

// Construcción del XML de Nota de Crédito (esquema notaCredito v1.1.0).
//
// NOTA DELIBERADA sobre los helpers: normalizeXmlText/esc/escText/dec/pad son
// copia literal de construirFacturaXml.ts, a propósito. Extraerlos a un módulo
// compartido obligaría a tocar el builder de facturas, que hoy está en
// producción y funcionando — el riesgo de romper la emisión real supera el
// beneficio de no duplicar 30 líneas. Si algún día se refactoriza, debe
// hacerse con los tests de ambos builders en verde antes y después.

import type {
  NotaCreditoInput,
  NotaCreditoXml,
  TotalImpuestoNotaCredito,
  DetalleNotaCredito,
} from "./types";
import type { ImpuestoDetalle } from "../types/factura";

// ─── Helpers (ver nota de arriba) ────────────────────────────────────────────

function normalizeXmlText(s: string): string {
  return String(s)
    .replace(/[“”ʺ＂]/g, '"')
    .replace(/[‘’ʼ＇]/g, "'")
    .replace(/[     　]/g, " ")
    .replace(/[​‌‍﻿­]/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/\r\n?/g, " ")
    .replace(/[\n\t]/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
}

function esc(v: string | number): string {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escText(v: string | number): string {
  return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

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

// ─── Sub-builders ────────────────────────────────────────────────────────────

// OJO: el totalImpuesto de la NC v1.1.0 lleva SOLO estos 4 elementos — no
// admite <tarifa> ni <descuentoAdicional> (a diferencia de la factura).
function buildTotalImpuesto(t: TotalImpuestoNotaCredito): string {
  return (
    `<totalImpuesto>` +
    `<codigo>${esc(t.codigo)}</codigo>` +
    `<codigoPorcentaje>${esc(t.codigoPorcentaje)}</codigoPorcentaje>` +
    `<baseImponible>${dec(t.baseImponible)}</baseImponible>` +
    `<valor>${dec(t.valor)}</valor>` +
    `</totalImpuesto>`
  );
}

// El impuesto DE LÍNEA sí lleva tarifa, igual que en factura.
function buildImpuestoLinea(imp: ImpuestoDetalle): string {
  return (
    `<impuesto>` +
    `<codigo>${esc(imp.codigo)}</codigo>` +
    `<codigoPorcentaje>${esc(imp.codigoPorcentaje)}</codigoPorcentaje>` +
    `<tarifa>${dec(imp.tarifa)}</tarifa>` +
    `<baseImponible>${dec(imp.baseImponible)}</baseImponible>` +
    `<valor>${dec(imp.valor)}</valor>` +
    `</impuesto>`
  );
}

function buildDetalle(d: DetalleNotaCredito): string {
  const codigoInterno   = d.codigoInterno   ? normalizeXmlText(d.codigoInterno)   : undefined;
  const codigoAdicional = d.codigoAdicional ? normalizeXmlText(d.codigoAdicional) : undefined;

  let xml =
    `<detalle>` +
    (codigoInterno   !== undefined ? `<codigoInterno>${escText(codigoInterno)}</codigoInterno>`       : "") +
    (codigoAdicional !== undefined ? `<codigoAdicional>${escText(codigoAdicional)}</codigoAdicional>` : "") +
    `<descripcion>${escFree(d.descripcion)}</descripcion>` +
    `<cantidad>${dec(d.cantidad)}</cantidad>` +
    `<precioUnitario>${dec(d.precioUnitario)}</precioUnitario>` +
    `<descuento>${dec(d.descuento)}</descuento>` +
    `<precioTotalSinImpuesto>${dec(d.precioTotalSinImpuesto)}</precioTotalSinImpuesto>`;

  if (d.detallesAdicionales?.length) {
    xml += `<detallesAdicionales>`;
    for (const da of d.detallesAdicionales.slice(0, 3)) {
      xml += `<detAdicional nombre="${esc(normalizeXmlText(da.nombre))}" valor="${esc(normalizeXmlText(da.valor))}"/>`;
    }
    xml += `</detallesAdicionales>`;
  }

  xml += `<impuestos>`;
  for (const imp of d.impuestos) xml += buildImpuestoLinea(imp);
  xml += `</impuestos>`;

  xml += `</detalle>`;
  return xml;
}

// ─── Builder principal ───────────────────────────────────────────────────────

/**
 * Genera el XML de la nota de crédito sin firma (la firma XAdES-BES se aplica
 * después, con el mismo firmarXml() de la factura).
 *
 * El orden de los elementos sigue estrictamente la secuencia del XSD
 * notaCredito v1.1.0 — no reordenar.
 */
export function construirNotaCreditoXml(input: NotaCreditoInput): NotaCreditoXml {
  const secuencial = pad(input.secuencial.replace(/\D/g, ""), 9);

  let xml = `<?xml version="1.0" encoding="UTF-8"?>`;
  xml += `<notaCredito id="comprobante" version="1.1.0">`;

  // ── infoTributaria (misma secuencia que factura; codDoc = "04") ──────────
  xml += `<infoTributaria>`;
  xml += `<ambiente>${esc(input.ambiente)}</ambiente>`;
  xml += `<tipoEmision>${esc(input.tipoEmision ?? "1")}</tipoEmision>`;
  xml += `<razonSocial>${esc(input.razonSocial)}</razonSocial>`;
  xml += optEl("nombreComercial", input.nombreComercial);
  xml += `<ruc>${esc(input.ruc)}</ruc>`;
  xml += `<claveAcceso>${esc(input.claveAcceso)}</claveAcceso>`;
  xml += `<codDoc>${esc(input.codDoc ?? "04")}</codDoc>`;
  xml += `<estab>${esc(pad(input.estab, 3))}</estab>`;
  xml += `<ptoEmi>${esc(pad(input.ptoEmi, 3))}</ptoEmi>`;
  xml += `<secuencial>${esc(secuencial)}</secuencial>`;
  xml += `<dirMatriz>${esc(input.dirMatriz)}</dirMatriz>`;
  xml += `</infoTributaria>`;

  // ── infoNotaCredito ─────────────────────────────────────────────────────
  xml += `<infoNotaCredito>`;
  xml += `<fechaEmision>${esc(fechaDDMMAAAA(input.fechaEmision))}</fechaEmision>`;
  xml += optEl("dirEstablecimiento", input.dirEstablecimiento);
  xml += `<tipoIdentificacionComprador>${esc(input.tipoIdentificacionComprador)}</tipoIdentificacionComprador>`;
  xml += `<razonSocialComprador>${escFree(input.razonSocialComprador)}</razonSocialComprador>`;
  xml += `<identificacionComprador>${escText(input.identificacionComprador)}</identificacionComprador>`;
  xml += optEl("contribuyenteEspecial", input.contribuyenteEspecial);
  xml += optEl("obligadoContabilidad", input.obligadoContabilidad);
  xml += optEl("rise", input.rise);
  xml += `<codDocModificado>${esc(input.codDocModificado)}</codDocModificado>`;
  xml += `<numDocModificado>${escText(input.numDocModificado)}</numDocModificado>`;
  xml += `<fechaEmisionDocSustento>${esc(fechaDDMMAAAA(input.fechaEmisionDocSustento))}</fechaEmisionDocSustento>`;
  xml += `<totalSinImpuestos>${dec(input.totalSinImpuestos)}</totalSinImpuestos>`;
  xml += `<valorModificacion>${dec(input.valorModificacion)}</valorModificacion>`;
  xml += optEl("moneda", input.moneda);
  xml += `<totalConImpuestos>`;
  for (const t of input.totalConImpuestos) xml += buildTotalImpuesto(t);
  xml += `</totalConImpuestos>`;
  xml += `<motivo>${escFree(input.motivo)}</motivo>`;
  xml += `</infoNotaCredito>`;

  // ── detalles ────────────────────────────────────────────────────────────
  xml += `<detalles>`;
  for (const d of input.detalles) xml += buildDetalle(d);
  xml += `</detalles>`;

  // ── infoAdicional (opcional, máx 15) ────────────────────────────────────
  if (input.infoAdicional?.length) {
    xml += `<infoAdicional>`;
    for (const c of input.infoAdicional.slice(0, 15)) {
      xml += `<campoAdicional nombre="${esc(normalizeXmlText(c.nombre))}">${escFree(c.valor)}</campoAdicional>`;
    }
    xml += `</infoAdicional>`;
  }

  xml += `</notaCredito>`;
  return xml;
}

import "server-only";

// Validación del XML de la nota de crédito ANTES de firmarlo y enviarlo
// (hallazgo NC-1 de la auditoría del 2026-08-05).
//
// ─── El problema que resuelve ────────────────────────────────────────────────
//
// La factura valida su XML contra el XSD oficial del SRI antes de firmar
// (`assertXmlValidoSri`). La nota de crédito NO lo hacía: un XML mal construido
// se firmaba, se enviaba, volvía DEVUELTA… y se llevaba por delante un número
// de secuencial, que en producción es un hueco en la serie que hay que
// justificar ante el SRI.
//
// ─── Por qué esto no es un XSD ───────────────────────────────────────────────
//
// El XSD oficial `notaCredito_V1.1.0.xsd` se publica dentro de un ZIP en el
// portal del SRI y no está en el repo (a diferencia del de factura, que sí).
// Escribir uno a mano sería peor que no tener nada: un esquema inventado con
// una restricción de más rechazaría notas de crédito perfectamente válidas.
//
// Así que esto valida ESTRUCTURA, no esquema: que estén los nodos que el SRI
// exige, en el orden correcto, y que los campos con formato fijo (clave de
// acceso, RUC, fechas, secuencial) tengan la forma que deben. Cubre los
// errores de construcción reales; no pretende sustituir al XSD.
//
// ─── Cuando aparezca el XSD oficial ──────────────────────────────────────────
//
// Si algún día se agrega `lib/facturacion/xsd/notaCredito_v1.1.0.xsd`, este
// módulo lo detecta solo y lo usa ADEMÁS de estas comprobaciones. No hay que
// tocar código: basta con dejar el archivo en su sitio.

import fs   from "fs";
import path from "path";

import { validarContraXsdArchivo } from "../xml/validarXsd";
import { FacturacionRechazoError } from "../errores";

const XSD_NC = path.join(process.cwd(), "lib/facturacion/xsd/notaCredito_v1.1.0.xsd");

export type ResultadoValidacionNC =
  | { valido: true; usoXsd: boolean }
  | { valido: false; usoXsd: boolean; errores: string[] };

// ─── Comprobaciones estructurales ────────────────────────────────────────────

/** Nodos obligatorios del esquema notaCredito v1.1.0, en el orden en que van. */
const NODOS_OBLIGATORIOS: string[] = [
  "infoTributaria",
  "ambiente",
  "tipoEmision",
  "razonSocial",
  "ruc",
  "claveAcceso",
  "codDoc",
  "estab",
  "ptoEmi",
  "secuencial",
  "dirMatriz",
  "infoNotaCredito",
  "fechaEmision",
  "tipoIdentificacionComprador",
  "razonSocialComprador",
  "identificacionComprador",
  "codDocModificado",
  "numDocModificado",
  "fechaEmisionDocSustento",
  "totalSinImpuestos",
  "valorModificacion",
  "moneda",
  "totalConImpuestos",
  "motivo",
  "detalles",
];

function contenido(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : null;
}

export function comprobacionesEstructurales(xml: string): string[] {
  const errores: string[] = [];

  // ── Raíz ──────────────────────────────────────────────────────────────────
  if (!/<notaCredito\b[^>]*\bversion="1\.1\.0"/.test(xml)) {
    errores.push('El nodo raíz debe ser <notaCredito ... version="1.1.0">.');
  }
  if (!/<notaCredito\b[^>]*\bid="comprobante"/.test(xml)) {
    errores.push('El nodo raíz debe llevar id="comprobante" (lo exige la firma XAdES).');
  }

  // ── Nodos presentes y en orden ────────────────────────────────────────────
  let desde = 0;
  for (const nodo of NODOS_OBLIGATORIOS) {
    const pos = xml.indexOf(`<${nodo}>`, desde);
    if (pos === -1) {
      // ¿Existe pero fuera de orden, o no existe?
      errores.push(
        xml.includes(`<${nodo}>`)
          ? `El nodo <${nodo}> está fuera del orden que exige el esquema.`
          : `Falta el nodo obligatorio <${nodo}>.`
      );
      continue;
    }
    desde = pos;
  }

  // ── Formatos fijos ────────────────────────────────────────────────────────
  const clave = contenido(xml, "claveAcceso");
  if (clave !== null && !/^\d{49}$/.test(clave)) {
    errores.push(`La clave de acceso debe tener 49 dígitos (tiene ${clave.length}).`);
  }

  const ruc = contenido(xml, "ruc");
  if (ruc !== null && !/^\d{13}$/.test(ruc)) {
    errores.push(`El RUC debe tener 13 dígitos (valor: "${ruc}").`);
  }

  const codDoc = contenido(xml, "codDoc");
  if (codDoc !== null && codDoc !== "04") {
    errores.push(`Una nota de crédito debe llevar codDoc "04" (valor: "${codDoc}").`);
  }

  const ambiente = contenido(xml, "ambiente");
  if (ambiente !== null && ambiente !== "1" && ambiente !== "2") {
    errores.push(`El ambiente debe ser "1" o "2" (valor: "${ambiente}").`);
  }

  for (const tag of ["estab", "ptoEmi"]) {
    const v = contenido(xml, tag);
    if (v !== null && !/^\d{3}$/.test(v)) {
      errores.push(`<${tag}> debe tener 3 dígitos (valor: "${v}").`);
    }
  }

  const secuencial = contenido(xml, "secuencial");
  if (secuencial !== null && !/^\d{9}$/.test(secuencial)) {
    errores.push(`El secuencial debe tener 9 dígitos (valor: "${secuencial}").`);
  }

  for (const tag of ["fechaEmision", "fechaEmisionDocSustento"]) {
    const v = contenido(xml, tag);
    if (v !== null && !/^\d{2}\/\d{2}\/\d{4}$/.test(v)) {
      errores.push(`<${tag}> debe tener formato dd/mm/aaaa (valor: "${v}").`);
    }
  }

  // El número del documento modificado va con la serie completa.
  const numDoc = contenido(xml, "numDocModificado");
  if (numDoc !== null && !/^\d{3}-\d{3}-\d{9}$/.test(numDoc)) {
    errores.push(
      `El número de la factura modificada debe tener formato 000-000-000000000 (valor: "${numDoc}").`
    );
  }

  // ── Motivo ────────────────────────────────────────────────────────────────
  const motivo = contenido(xml, "motivo");
  if (motivo !== null && motivo.trim().length === 0) {
    errores.push("El motivo no puede ir vacío — el SRI observa las notas de crédito sin motivo.");
  }

  // ── Detalles ──────────────────────────────────────────────────────────────
  const detalles = contenido(xml, "detalles");
  if (detalles !== null && !detalles.includes("<detalle>")) {
    errores.push("La nota de crédito no tiene ninguna línea de detalle.");
  }

  // ── Importes ──────────────────────────────────────────────────────────────
  // El SRI exige punto decimal y hasta 2 decimales; una coma o un número en
  // notación científica (que aparece con valores muy pequeños) lo rechaza.
  for (const tag of ["totalSinImpuestos", "valorModificacion"]) {
    const v = contenido(xml, tag);
    if (v !== null && !/^-?\d+(\.\d{1,2})?$/.test(v)) {
      errores.push(`<${tag}> debe ser un número con hasta 2 decimales y punto (valor: "${v}").`);
    }
  }

  return errores;
}

// ─── API ─────────────────────────────────────────────────────────────────────

export function validarNotaCreditoXml(xml: string): ResultadoValidacionNC {
  const errores = comprobacionesEstructurales(xml);

  // Si el XSD oficial está en el repo, se usa además. `validarContraXsdArchivo`
  // distingue "el XML es inválido" de "no se pudo validar" (por ejemplo, si
  // xmllint no existe en el entorno) — un fallo de herramienta nunca debe
  // hacerse pasar por un documento inválido.
  let usoXsd = false;
  if (fs.existsSync(XSD_NC)) {
    const r = validarContraXsdArchivo(xml, XSD_NC);
    if (r.estado === "invalido") {
      usoXsd = true;
      errores.push(...r.errores);
    } else if (r.estado === "valido") {
      usoXsd = true;
    }
  }

  return errores.length === 0
    ? { valido: true, usoXsd }
    : { valido: false, usoXsd, errores };
}

/** Aborta la emisión si el XML no pasa. Mismo contrato que la factura. */
export function assertNotaCreditoValida(xml: string): void {
  const r = validarNotaCreditoXml(xml);
  if (!r.valido) {
    throw new FacturacionRechazoError(
      `El XML de la nota de crédito no es válido: ${r.errores.join(" | ")}`
    );
  }
}

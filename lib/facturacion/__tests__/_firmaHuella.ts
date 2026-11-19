import assert from "node:assert/strict";
import crypto, { X509Certificate } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mock } from "node:test";
import path from "node:path";
import { construirFacturaXml } from "../xml/construirFacturaXml";
import { construirNotaCreditoXml } from "../notaCredito/construirNotaCreditoXml";
import { generateAccessKey } from "../claveAcceso";
import { validarContraXsdArchivo } from "../xml/validarXsd";
import { firmarXml, type TipoComprobanteFirma } from "../firma/firmar";
import type { FacturaInput } from "../types/factura";

const DS = "http://www.w3.org/2000/09/xmldsig#";
export const FIXTURES_HUELLA = path.join(__dirname, "__fixtures__");

// Mismos datos de firmar.test.ts; el builder de NC completa la estructura
// mínima de firmarNotaCredito.test.ts para poder exigir también su XSD.
export function documentosFijos(): Record<TipoComprobanteFirma, string> {
  const fecha = new Date(2024, 0, 15);
  const clave = (tipoComprobante: "01" | "04") => generateAccessKey({
    fechaEmision: fecha, tipoComprobante, ruc: "1792146739001", ambiente: "1",
    establecimiento: "001", puntoEmision: "001", secuencial: "2", codigoNumerico: "87654321",
  });
  const factura: FacturaInput = {
    ambiente: "1", razonSocial: "SUPER GEEK S.A.", ruc: "1792146739001",
    claveAcceso: clave("01"), estab: "001", ptoEmi: "001", secuencial: "2",
    dirMatriz: "AV. REPUBLICA E7-101 Y DIEGO DE ALMAGRO, QUITO", fechaEmision: fecha,
    tipoIdentificacionComprador: "05", razonSocialComprador: "CLIENTE PRUEBA",
    identificacionComprador: "1234567890", totalSinImpuestos: 100, totalDescuento: 0,
    totalConImpuestos: [{ codigo: "2", codigoPorcentaje: "10", baseImponible: 100, tarifa: 15, valor: 15 }],
    importeTotal: 115, pagos: [{ formaPago: "01", total: 115 }],
    detalles: [{ descripcion: "SERVICIO DE REPARACION DE EQUIPO", cantidad: 1,
      precioUnitario: 100, descuento: 0, precioTotalSinImpuesto: 100,
      impuestos: [{ codigo: "2", codigoPorcentaje: "10", tarifa: 15, baseImponible: 100, valor: 15 }],
    }],
  };
  return {
    factura: construirFacturaXml(factura),
    notaCredito: construirNotaCreditoXml({
      ...factura, codDoc: "04", claveAcceso: clave("04"), codDocModificado: "01",
      numDocModificado: "001-001-000000002", fechaEmisionDocSustento: fecha,
      valorModificacion: 115, moneda: "DOLAR", motivo: "Devolucion fija para prueba de firma",
      detalles: factura.detalles.map(d => ({ ...d, codigoInterno: "SRV-PRUEBA-001" })),
    }),
  };
}

export function sha256(xml: string): string {
  return crypto.createHash("sha256").update(xml, "utf8").digest("hex");
}

/** Solo durante la firma, con zona explícita: idéntico en Mac y CI (UTC). */
export async function firmarCongelado(
  xmlSinFirmar: string, p12Path: string, p12Clave: string, tipo: TipoComprobanteFirma,
): Promise<string> {
  const zonaAnterior = process.env.TZ;
  process.env.TZ = "UTC";
  let numero = 0;
  const uuid = mock.method(crypto, "randomUUID", () =>
    `00000000-0000-4000-8000-${String(++numero).padStart(12, "0")}` as `${string}-${string}-${string}-${string}-${string}`,
  );
  mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-19T17:00:00.000Z") });
  try {
    const xml = await firmarXml({ xmlSinFirmar, p12Path, p12Clave, tipo });
    assert.equal(numero, 9, "El signer debe consumir los nueve UUID congelados");
    assert.match(xml, /2026-11-19T17:00:00\.000\+00:00/, "SigningTime congelado");
    return xml;
  } finally {
    mock.timers.reset();
    uuid.mock.restore();
    if (zonaAnterior === undefined) delete process.env.TZ;
    else process.env.TZ = zonaAnterior;
  }
}

function elemento(xml: string, nombre: string): string {
  const m = xml.match(new RegExp(`<${nombre}\\b[^>]*>[\\s\\S]*?</${nombre}>`, "g"));
  assert.equal(m?.length, 1, `Debe existir exactamente un ${nombre}`);
  return m![0];
}

/** Verificación independiente: libxml2 canonicaliza; Node/OpenSSL verifica. */
export function verificarFirmaNativa(xml: string): void {
  const signedInfo = elemento(xml, "ds:SignedInfo").replace(
    "<ds:SignedInfo ", `<ds:SignedInfo xmlns:ds="${DS}" `,
  );
  const canonico = execFileSync("xmllint", ["--nonet", "--c14n", "-"], {
    input: signedInfo, stdio: ["pipe", "pipe", "pipe"],
  });
  const contenido = (nombre: string) => elemento(xml, nombre)
    .replace(/^<[^>]+>/, "").replace(/<\/[^>]+>$/, "").replace(/\s/g, "");
  const certificado = new X509Certificate(Buffer.from(contenido("ds:X509Certificate"), "base64"));
  const firma = Buffer.from(contenido("ds:SignatureValue"), "base64");
  assert(crypto.verify("RSA-SHA1", canonico, certificado.publicKey, firma),
    "SignatureValue inválida según crypto nativo de Node (RSA-SHA1)");
  // Control negativo: el verificador debe detectar una firma alterada.
  const alterada = Buffer.from(firma);
  alterada[0] ^= 1;
  assert(!crypto.verify("RSA-SHA1", canonico, certificado.publicKey, alterada),
    "El verificador debe rechazar una SignatureValue alterada");
}

export function validarXmlFirmado(xml: string, tipo: TipoComprobanteFirma): void {
  const esquema = tipo === "factura"
    ? path.join(process.cwd(), "lib/facturacion/xsd/factura_v2.1.0.xsd")
    : path.join(FIXTURES_HUELLA, "notaCredito_v1.1.0.xsd");
  // No aceptar el fallback permisivo si xmllint o el esquema faltan.
  const resultado = validarContraXsdArchivo(xml, esquema);
  assert.equal(resultado.estado, "valido", `${tipo}: el XML firmado debe pasar el XSD`);
}

/** Las instantáneas de prueba nunca incluyen base64 del certificado. */
export function xmlSinCertificado(xml: string): string {
  return xml.replace(/(<ds:X509Certificate\b[^>]*>)[\s\S]*?(<\/ds:X509Certificate>)/g,
    "$1[CERTIFICADO OMITIDO]$2");
}

export function primeraDiferencia(esperado: string, actual: string): string {
  let i = 0;
  while (i < esperado.length && esperado[i] === actual[i]) i++;
  const antes = actual.slice(0, i);
  const linea = antes.split("\n").length;
  const columna = i - antes.lastIndexOf("\n");
  const contexto = (s: string) => JSON.stringify(s.slice(Math.max(0, i - 60), i + 100));
  return `Primera diferencia en carácter ${i}, línea ${linea}, columna ${columna}.\n` +
    `Esperado: ${contexto(esperado)}\nActual: ${contexto(actual)}`;
}

/**
 * Test — validación del XML de nota de crédito antes de firmar (NC-1).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/notaCredito.validacion.test.ts
 *
 * El XML se construye con el builder REAL (construirNotaCreditoXml) y se
 * degrada a propósito para comprobar que cada defecto se detecta. Así el test
 * no valida contra una idea del XML, sino contra el que de verdad se emite.
 *
 * Contexto: la factura valida contra el XSD del SRI antes de firmar; la nota
 * de crédito no lo hacía. Un XML mal construido se firmaba, se enviaba, volvía
 * DEVUELTA y se llevaba un número de la serie — en producción, un hueco que
 * hay que justificar ante el SRI.
 */

import { construirNotaCreditoXml } from "../notaCredito/construirNotaCreditoXml";
import { validarNotaCreditoXml, comprobacionesEstructurales, assertNotaCreditoValida } from "../notaCredito/validarNotaCredito";
import { validarContraXsdArchivo, xmllintDisponible, validarContraXsd } from "../xml/validarXsd";
import { FacturacionRechazoError } from "../errores";
import type { DetalleNotaCredito } from "../notaCredito/types";

let fallos = 0;

function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); }
  else       { console.log("✓", msg); }
}

/** ¿Alguno de los errores menciona este texto? */
function menciona(errores: string[], texto: string): boolean {
  return errores.some((e) => e.toLowerCase().includes(texto.toLowerCase()));
}

// ─── XML de referencia, construido con el builder real ──────────────────────

const detalle: DetalleNotaCredito = {
  codigoInterno:          "LAP-000013",
  descripcion:            "Lenovo ThinkPad P1 Gen 3",
  cantidad:               1,
  precioUnitario:         790,
  descuento:              0,
  precioTotalSinImpuesto: 790,
  impuestos: [{ codigo: "2", codigoPorcentaje: "4", tarifa: 15, baseImponible: 790, valor: 118.5 }],
  devolucionFisica:       true,
};

function xmlBase(): string {
  return construirNotaCreditoXml({
    ambiente:        "1",
    razonSocial:     "BOLAÑOS FLORES ALEXIS RUBEN",
    nombreComercial: "SUPER TIENDA GEEK",
    ruc:             "1003710272001",
    claveAcceso:     "1".repeat(49),
    estab:           "001",
    ptoEmi:          "002",
    secuencial:      "000000005",
    dirMatriz:       "Otavalo, edificio Kaillari",
    fechaEmision:    new Date(2026, 7, 5),
    tipoIdentificacionComprador: "05",
    razonSocialComprador:        "ALEX BOLAÑOS",
    identificacionComprador:     "1003710272",
    codDocModificado:            "01",
    numDocModificado:            "001-002-000000681",
    fechaEmisionDocSustento:     new Date(2026, 6, 20),
    totalSinImpuestos:           790,
    valorModificacion:           908.5,
    moneda:                      "DOLAR",
    totalConImpuestos: [{ codigo: "2", codigoPorcentaje: "4", baseImponible: 790, valor: 118.5 }],
    motivo:                      "Devolución de equipo por falla de temperatura",
    detalles:                    [detalle],
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. El XML real pasa
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n── el XML que de verdad se emite es válido ──");

const xml = xmlBase();
const rBase = validarNotaCreditoXml(xml);

assert(rBase.valido === true,
  "El XML construido por construirNotaCreditoXml() pasa la validación");
if (!rBase.valido) console.error("   errores:", rBase.errores);

assert(comprobacionesEstructurales(xml).length === 0,
  "…y no arroja ninguna comprobación estructural fallida");

let lanzo = false;
try { assertNotaCreditoValida(xml); } catch { lanzo = true; }
assert(!lanzo, "assertNotaCreditoValida() no lanza con el XML correcto");

// ═══════════════════════════════════════════════════════════════════════════
// 2. Cada defecto se detecta
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n── detecta los defectos de construcción ──");

function errores(mutado: string): string[] {
  const r = validarNotaCreditoXml(mutado);
  return r.valido ? [] : r.errores;
}

// Nodo obligatorio ausente
assert(menciona(errores(xml.replace(/<motivo>.*?<\/motivo>/, "")), "motivo"),
  "Detecta que falta <motivo>");
assert(menciona(errores(xml.replace(/<numDocModificado>.*?<\/numDocModificado>/, "")), "numDocModificado"),
  "Detecta que falta <numDocModificado> — sin él el SRI no sabe qué factura se modifica");
assert(menciona(errores(xml.replace("<detalles>", "<detallesX>").replace("</detalles>", "</detallesX>")), "detalles"),
  "Detecta que faltan los <detalles>");

// Formatos fijos
assert(menciona(errores(xml.replace("1".repeat(49), "123")), "clave de acceso"),
  "Detecta una clave de acceso que no tiene 49 dígitos");
assert(menciona(errores(xml.replace("<ruc>1003710272001</ruc>", "<ruc>100371027</ruc>")), "ruc"),
  "Detecta un RUC con longitud incorrecta");
assert(menciona(errores(xml.replace("<codDoc>04</codDoc>", "<codDoc>01</codDoc>")), "04"),
  "Detecta codDoc 01 — sería una factura, no una nota de crédito");
assert(menciona(errores(xml.replace("<secuencial>000000005</secuencial>", "<secuencial>5</secuencial>")), "secuencial"),
  "Detecta un secuencial sin los 9 dígitos");
assert(menciona(errores(xml.replace("<estab>001</estab>", "<estab>1</estab>")), "estab"),
  "Detecta un establecimiento sin los 3 dígitos");
assert(menciona(errores(xml.replace("<ambiente>1</ambiente>", "<ambiente>3</ambiente>")), "ambiente"),
  "Detecta un ambiente que no es 1 ni 2");
assert(menciona(errores(xml.replace("<numDocModificado>001-002-000000681</numDocModificado>", "<numDocModificado>681</numDocModificado>")), "000-000-000000000"),
  "Detecta un número de factura modificada mal formado");

// Importes: coma decimal y notación científica son los dos casos que el SRI
// rechaza y que aparecen solos al operar con números.
assert(menciona(errores(xml.replace("<valorModificacion>908.50</valorModificacion>", "<valorModificacion>908,50</valorModificacion>")), "valorModificacion"),
  "Detecta un importe con coma decimal en vez de punto");
assert(menciona(errores(xml.replace("<valorModificacion>908.50</valorModificacion>", "<valorModificacion>9.0850e2</valorModificacion>")), "valorModificacion"),
  "Detecta un importe en notación científica");
assert(menciona(errores(xml.replace("<totalSinImpuestos>790.00</totalSinImpuestos>", "<totalSinImpuestos>790.12345</totalSinImpuestos>")), "totalSinImpuestos"),
  "Detecta un importe con más de 2 decimales");

// Motivo vacío
assert(menciona(errores(xml.replace(/<motivo>.*?<\/motivo>/, "<motivo></motivo>")), "motivo"),
  "Detecta un motivo vacío");

// Raíz
assert(menciona(errores(xml.replace('version="1.1.0"', 'version="1.0.0"')), "1.1.0"),
  "Detecta una versión de esquema distinta a la 1.1.0");
assert(menciona(errores(xml.replace('id="comprobante"', 'id="otro"')), "comprobante"),
  'Detecta la pérdida de id="comprobante" — sin él la firma XAdES no engancha');

// Orden de nodos
const desordenado = xml.replace(
  "<totalSinImpuestos>790.00</totalSinImpuestos><valorModificacion>908.50</valorModificacion>",
  "<valorModificacion>908.50</valorModificacion><totalSinImpuestos>790.00</totalSinImpuestos>"
);
assert(desordenado !== xml && menciona(errores(desordenado), "orden"),
  "Detecta nodos fuera del orden que exige el esquema");

// assertNotaCreditoValida lanza el error correcto
let capturado: unknown = null;
try { assertNotaCreditoValida(xml.replace(/<motivo>.*?<\/motivo>/, "")); } catch (e) { capturado = e; }
assert(capturado instanceof FacturacionRechazoError,
  "assertNotaCreditoValida lanza FacturacionRechazoError — el endpoint lo traduce a 400");

// ═══════════════════════════════════════════════════════════════════════════
// 3. La validación XSD no puede disfrazar un fallo de herramienta
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n── xmllint ausente ≠ documento inválido ──");

console.log(`   (xmllint en este entorno: ${xmllintDisponible() ? "disponible" : "AUSENTE"})`);

const sinEsquema = validarContraXsdArchivo("<a/>", "/ruta/que/no/existe.xsd");
assert(sinEsquema.estado === "no-verificable",
  "Un XSD que no existe da 'no-verificable', no 'inválido'");

// El caso que motivó todo esto: si xmllint faltara, la versión anterior
// devolvía { valido:false, errores:[] } y TODA emisión se caía con un mensaje
// vacío. Ahora la factura sigue adelante.
const rFactura = validarContraXsd(xml); // un XML de NC no valida contra el XSD de factura
assert(typeof rFactura.valido === "boolean",
  "validarContraXsd sigue devolviendo la forma booleana de siempre");
if (!rFactura.valido) {
  assert(rFactura.errores.length > 0,
    "Si declara inválido, SIEMPRE explica por qué — nunca una lista vacía");
}

// ─────────────────────────────────────────────────────────────────────────────

if (fallos > 0) {
  console.error(`\n❌ notaCredito.validacion.test.ts — ${fallos} aserción(es) fallida(s)`);
  process.exit(1);
}
console.log("\n✅ notaCredito.validacion.test.ts — todos los asserts pasaron");

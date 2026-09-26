/**
 * Test — "RUC Proveedor" en infoAdicional (Res. NAC-DGERCGC26-00000027,
 * Ficha Técnica Offline v2.34, Anexo 26).
 * Ejecutar: npm test rucProveedor
 *
 * Sin red, sin Airtable. Cubre:
 *   A. Factura: el XML trae <campoAdicional nombre="RUC Proveedor">, pasa el
 *      XSD oficial v2.1.0 y el infoTributaria (RUC emisor) no cambia.
 *   B. Nota de crédito: mismo campo, validación estructural (+ XSD si está).
 *   C. Sin duplicados: variantes de escritura, actualización de valor y
 *      conservación de la posición.
 *   D. Tope de 15 del XSD: el RUC Proveedor nunca se pierde.
 *   E. Configuración: variable, respaldo con el RUC del emisor, RUC inválido.
 *   F. Firma: el campo queda dentro del XML firmado.
 *   G. RIDE: el bloque "Información adicional" muestra el dato.
 */

import path from "path";

import { construirFacturaXml } from "../xml/construirFacturaXml";
import { validarContraXsdArchivo } from "../xml/validarXsd";
import { construirNotaCreditoXml } from "../notaCredito/construirNotaCreditoXml";
import { validarNotaCreditoXml } from "../notaCredito/validarNotaCredito";
import { construirLineaNotaCredito, calcularTotalesNotaCredito } from "../notaCredito/calculos";
import { construirInfoAdicionalFactura } from "../reglas/referenciaPago";
import {
  NOMBRE_CAMPO_RUC_PROVEEDOR,
  aplicarRucProveedor,
  esCampoRucProveedor,
  normalizarNombreCampo,
  resolverRucProveedor,
  infoAdicionalConRucProveedor,
} from "../reglas/rucProveedor";
import { firmarXml } from "../firma/firmar";
import { filasInfoAdicionalRide, generarRide } from "../ride/generarRide";
import { generateAccessKey } from "../claveAcceso";
import type { CampoAdicional, DetalleFactura, FacturaInput, Pago } from "../types/factura";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}
function lanza(fn: () => unknown): Error | null {
  try { fn(); return null; } catch (e) { return e as Error; }
}

const RUC_EMISOR    = "1003710272001";
const RUC_PROVEEDOR = "1003710272001";
const CAMPO_XML     = `<campoAdicional nombre="RUC Proveedor">${RUC_PROVEEDOR}</campoAdicional>`;
const XSD_FACTURA   = path.join(process.cwd(), "lib/facturacion/xsd/factura_v2.1.0.xsd");

function contar(xml: string, aguja: string): number {
  return xml.split(aguja).length - 1;
}
function infoTributaria(xml: string): string {
  return xml.slice(xml.indexOf("<infoTributaria>"), xml.indexOf("</infoTributaria>"));
}

// ─── Fixture de factura ──────────────────────────────────────────────────────

const fecha = new Date(2026, 8, 24);
const linea: DetalleFactura = {
  codigoPrincipal: "LAP-000001",
  descripcion: "Dell Vostro 3420 Core i5-1135G7 512GB 16GB",
  cantidad: 1,
  precioUnitario: 400,
  descuento: 0,
  precioTotalSinImpuesto: 400,
  impuestos: [{ codigo: "2", codigoPorcentaje: "4", tarifa: 15, baseImponible: 400, valor: 60 }],
};
const pagos: Pago[] = [{ formaPago: "20", total: 460, referencia: "TRX-889", metodoPago: "Transferencia" }];

function facturaInput(infoAdicional: CampoAdicional[] | undefined): FacturaInput {
  return {
    ambiente: "1",
    razonSocial: "BOLAÑOS FLORES ALEXIS RUBEN",
    nombreComercial: "SUPER TIENDA GEEK",
    ruc: RUC_EMISOR,
    claveAcceso: generateAccessKey({
      fechaEmision: fecha, tipoComprobante: "01", ruc: RUC_EMISOR, ambiente: "1",
      establecimiento: "001", puntoEmision: "002", secuencial: "999", codigoNumerico: "12345678",
    }),
    estab: "001",
    ptoEmi: "002",
    secuencial: "999",
    dirMatriz: "Cristobal Colón y Atahualpa, Otavalo",
    fechaEmision: fecha,
    obligadoContabilidad: "NO",
    tipoIdentificacionComprador: "05",
    razonSocialComprador: "CLIENTE PRUEBA",
    identificacionComprador: "1004129530",
    totalSinImpuestos: 400,
    totalDescuento: 0,
    totalConImpuestos: [{ codigo: "2", codigoPorcentaje: "4", baseImponible: 400, tarifa: 15, valor: 60 }],
    importeTotal: 460,
    pagos,
    detalles: [linea],
    ...(infoAdicional?.length ? { infoAdicional } : {}),
  };
}

(async () => {
  // ─── A. Factura ────────────────────────────────────────────────────────────
  const infoFactura = construirInfoAdicionalFactura("Joseph Bolaños", undefined, pagos, RUC_PROVEEDOR);
  const xmlFactura  = construirFacturaXml(facturaInput(infoFactura));
  const xmlSinRuc   = construirFacturaXml(facturaInput(construirInfoAdicionalFactura("Joseph Bolaños", undefined, pagos)));

  assert(xmlFactura.includes(CAMPO_XML), 'Factura: incluye <campoAdicional nombre="RUC Proveedor">1003710272001</campoAdicional>');
  assert(contar(xmlFactura, 'nombre="RUC Proveedor"') === 1, "Factura: el campo aparece exactamente una vez");
  assert(
    xmlFactura.indexOf(CAMPO_XML) > xmlFactura.indexOf("<infoAdicional>") &&
    xmlFactura.indexOf(CAMPO_XML) < xmlFactura.indexOf("</infoAdicional>"),
    "Factura: el campo está DENTRO de <infoAdicional>"
  );
  assert(infoTributaria(xmlFactura) === infoTributaria(xmlSinRuc), "Factura: infoTributaria idéntica con y sin el campo (RUC emisor intacto)");
  assert(infoFactura[0].nombre === "Vendedor" && infoFactura[infoFactura.length - 1].nombre === NOMBRE_CAMPO_RUC_PROVEEDOR,
    "Factura: Vendedor sigue primero y RUC Proveedor queda al final");
  assert(infoFactura.some((c) => c.nombre === "Transferencia 1" && c.valor === "TRX-889"), "Factura: las referencias de pago no se pierden");
  {
    const r = validarContraXsdArchivo(xmlFactura, XSD_FACTURA);
    if (r.estado === "no-verificable") console.warn(`  (aviso) XSD de factura no verificable aquí: ${r.motivo}`);
    assert(r.estado !== "invalido", `Factura: pasa el XSD oficial SRI v2.1.0${r.estado === "invalido" ? " — " + r.errores.join(" | ") : ""}`);
  }
  assert(
    JSON.stringify(construirInfoAdicionalFactura("Joseph Bolaños", undefined, pagos)) ===
    JSON.stringify([{ nombre: "Vendedor", valor: "Joseph Bolaños" }, { nombre: "Transferencia 1", valor: "TRX-889" }]),
    "Factura: sin rucProveedor, construirInfoAdicionalFactura se comporta EXACTAMENTE como antes"
  );

  // ─── B. Nota de crédito ────────────────────────────────────────────────────
  const detalleNC = construirLineaNotaCredito({ ...linea, tipo: "producto" }, 1, true);
  const totalesNC = calcularTotalesNotaCredito([detalleNC]);
  const infoNC    = aplicarRucProveedor(undefined, RUC_PROVEEDOR);
  const xmlNC = construirNotaCreditoXml({
    ambiente: "1",
    razonSocial: "BOLAÑOS FLORES ALEXIS RUBEN",
    nombreComercial: "SUPER TIENDA GEEK",
    ruc: RUC_EMISOR,
    claveAcceso: generateAccessKey({
      fechaEmision: fecha, tipoComprobante: "04", ruc: RUC_EMISOR, ambiente: "1",
      establecimiento: "001", puntoEmision: "002", secuencial: "5", codigoNumerico: "12345678",
    }),
    estab: "001",
    ptoEmi: "002",
    secuencial: "5",
    dirMatriz: "Cristobal Colón y Atahualpa, Otavalo",
    fechaEmision: fecha,
    tipoIdentificacionComprador: "05",
    razonSocialComprador: "CLIENTE PRUEBA",
    identificacionComprador: "1004129530",
    obligadoContabilidad: "NO",
    codDocModificado: "01",
    numDocModificado: "001-002-000000999",
    fechaEmisionDocSustento: fecha,
    totalSinImpuestos: totalesNC.totalSinImpuestos,
    valorModificacion: totalesNC.valorModificacion,
    moneda: "DOLAR",
    totalConImpuestos: totalesNC.totalConImpuestos,
    motivo: "Devolución de equipo por falla de pantalla",
    detalles: [detalleNC],
    infoAdicional: infoNC,
  });
  assert(xmlNC.includes(CAMPO_XML), 'Nota de crédito: incluye <campoAdicional nombre="RUC Proveedor">');
  assert(contar(xmlNC, 'nombre="RUC Proveedor"') === 1, "Nota de crédito: el campo aparece exactamente una vez");
  assert(xmlNC.indexOf("<infoAdicional>") > xmlNC.indexOf("</detalles>") && xmlNC.indexOf("</infoAdicional>") < xmlNC.indexOf("</notaCredito>"),
    "Nota de crédito: <infoAdicional> va después de <detalles> (orden del XSD v1.1.0)");
  assert(xmlNC.includes(`<ruc>${RUC_EMISOR}</ruc>`), "Nota de crédito: RUC emisor intacto en infoTributaria");
  {
    const r = validarNotaCreditoXml(xmlNC);
    assert(r.valido, `Nota de crédito: pasa la validación previa a la firma${r.valido ? "" : " — " + r.errores.join(" | ")}`);
  }

  // ─── C. Sin duplicados ─────────────────────────────────────────────────────
  for (const variante of ["RUC Proveedor", "ruc proveedor", "RUC  PROVEEDOR", "Ruc_Proveedor", "RUC-Proveedor", "RÚC Proveedor", " RUC Proveedor "]) {
    assert(esCampoRucProveedor(variante), `Normalización: "${variante}" se reconoce como RUC Proveedor`);
  }
  assert(!esCampoRucProveedor("RUC Cliente") && !esCampoRucProveedor("Proveedor"), "Normalización: otros nombres no se confunden");
  assert(normalizarNombreCampo("RÚC__Proveedor") === "ruc proveedor", "Normalización: sin tildes, minúsculas y separadores colapsados");
  {
    const entrada: CampoAdicional[] = [
      { nombre: "Vendedor", valor: "Joseph" },
      { nombre: "ruc proveedor", valor: "1799999999001" },
      { nombre: "Correo", valor: "x@y.com" },
      { nombre: "RUC_PROVEEDOR", valor: "0000000000001" },
    ];
    const salida = aplicarRucProveedor(entrada, RUC_PROVEEDOR);
    assert(salida.filter((c) => esCampoRucProveedor(c.nombre)).length === 1, "Duplicados: queda UN solo RUC Proveedor aunque vinieran dos variantes");
    assert(salida[1].nombre === "RUC Proveedor" && salida[1].valor === RUC_PROVEEDOR, "Existente: se actualiza el valor, en su misma posición y con el nombre exacto");
    assert(salida.length === 3 && salida[0].nombre === "Vendedor" && salida[2].nombre === "Correo", "Existente: los demás campos y su orden no cambian");
    assert(entrada[1].valor === "1799999999001", "Existente: no muta el arreglo de entrada");
  }
  {
    const dosVeces = aplicarRucProveedor(aplicarRucProveedor([{ nombre: "Vendedor", valor: "J" }], RUC_PROVEEDOR), RUC_PROVEEDOR);
    assert(dosVeces.length === 2, "Idempotente: aplicarlo dos veces no duplica el campo");
  }
  {
    const extra: CampoAdicional[] = [{ nombre: "Ruc Proveedor", valor: "1799999999001" }];
    const r = construirInfoAdicionalFactura("Joseph", extra, pagos, RUC_PROVEEDOR);
    assert(r.filter((c) => esCampoRucProveedor(c.nombre)).length === 1 && r.find((c) => esCampoRucProveedor(c.nombre))!.valor === RUC_PROVEEDOR,
      "Factura: un RUC Proveedor que ya venía (p. ej. de un reintento) se actualiza, no se duplica");
    const xml = construirFacturaXml(facturaInput(r));
    assert(contar(xml, "RUC Proveedor") === 1, "Factura (reintento): el XML final lleva el campo una sola vez");
  }

  // ─── D. Tope de 15 ─────────────────────────────────────────────────────────
  {
    const muchosPagos: Pago[] = Array.from({ length: 20 }, (_, i) => ({
      formaPago: "20", total: 1, referencia: `REF-${i + 1}`, metodoPago: "DeUna",
    }));
    const r = construirInfoAdicionalFactura("Joseph", undefined, muchosPagos, RUC_PROVEEDOR);
    assert(r.length === 15, `Tope 15: con Vendedor + 20 referencias el total queda en 15 (hay ${r.length})`);
    assert(r[r.length - 1].nombre === "RUC Proveedor", "Tope 15: el RUC Proveedor tiene su lugar reservado y no se recorta");
    assert(r.some((c) => c.nombre === "Otras referencias de pago" && c.valor.includes("REF-20")), "Tope 15: las referencias sobrantes se juntan, no se pierden");
    const xml = construirFacturaXml(facturaInput(r));
    assert(xml.includes(CAMPO_XML), "Tope 15: el campo sobrevive al slice(0, 15) del constructor del XML");
    const v = validarContraXsdArchivo(xml, XSD_FACTURA);
    assert(v.estado !== "invalido", "Tope 15: la factura con 15 campos pasa el XSD");
  }
  {
    const quince: CampoAdicional[] = Array.from({ length: 15 }, (_, i) => ({ nombre: `Campo ${i + 1}`, valor: "x" }));
    const e = lanza(() => aplicarRucProveedor(quince, RUC_PROVEEDOR));
    assert(!!e && /máximo 15/.test(e.message), "Tope 15: si no hay espacio, error claro ANTES de firmar (nunca un campo perdido en silencio)");
  }

  // ─── E. Configuración ──────────────────────────────────────────────────────
  {
    const c = resolverRucProveedor(RUC_EMISOR, {
      SRI_PROVEEDOR_SISTEMA_RUC: " 1003710272001 ",
      SRI_PROVEEDOR_SISTEMA_NOMBRE: "Sistema propio Portal Staff SUPER GEEK",
    });
    assert(c.ruc === "1003710272001" && c.origen === "variable" && !c.aviso, "Config: la variable manda (y se recortan espacios)");
    assert(c.nombre === "Sistema propio Portal Staff SUPER GEEK", "Config: el nombre se lee como dato interno");
    const campos = infoAdicionalConRucProveedor(undefined, RUC_EMISOR, {
      SRI_PROVEEDOR_SISTEMA_RUC: "1003710272001",
      SRI_PROVEEDOR_SISTEMA_NOMBRE: "Sistema propio Portal Staff SUPER GEEK",
    });
    assert(campos.length === 1 && !JSON.stringify(campos).includes("Sistema propio"), "Config: el NOMBRE del sistema nunca va al XML");
  }
  {
    const avisos: string[] = [];
    const warn = console.warn;
    console.warn = (m: string) => { avisos.push(String(m)); };
    const campos = infoAdicionalConRucProveedor(undefined, RUC_EMISOR, {});
    console.warn = warn;
    assert(campos[0].valor === RUC_EMISOR, "Config ausente: se usa el RUC del emisor (sistema propio) — nunca un comprobante sin el campo");
    assert(avisos.some((m) => m.includes("SRI_PROVEEDOR_SISTEMA_RUC no está configurada")), "Config ausente: queda un aviso en los logs");
  }
  for (const malo of ["123", "10037102720011", "1003710272000", "ABC3710272001", "9903710272001"]) {
    const e = lanza(() => resolverRucProveedor(RUC_EMISOR, { SRI_PROVEEDOR_SISTEMA_RUC: malo }));
    assert(!!e && e.name === "FacturacionRechazoError" && e.message.includes("SRI_PROVEEDOR_SISTEMA_RUC"),
      `Config inválida ("${malo}"): bloquea con un mensaje que nombra la variable`);
  }

  // ─── F. Firma ──────────────────────────────────────────────────────────────
  {
    const P12 = path.join(__dirname, "__fixtures__", "test-cert.p12");
    const firmadaFactura = await firmarXml({ xmlSinFirmar: xmlFactura, p12Path: P12, p12Clave: "testclave123" });
    assert(firmadaFactura.includes(CAMPO_XML) && firmadaFactura.indexOf(CAMPO_XML) < firmadaFactura.indexOf("Signature"),
      "Firma (factura): el campo está en el XML firmado, antes del bloque de firma");
    const firmadaNC = await firmarXml({ xmlSinFirmar: xmlNC, p12Path: P12, p12Clave: "testclave123", tipo: "notaCredito" });
    assert(firmadaNC.includes(CAMPO_XML) && firmadaNC.indexOf(CAMPO_XML) < firmadaNC.indexOf("Signature"),
      "Firma (nota de crédito): el campo está en el XML firmado, antes del bloque de firma");
  }

  // ─── G. RIDE ───────────────────────────────────────────────────────────────
  {
    const filas = filasInfoAdicionalRide(infoFactura);
    assert(filas.some(([n, v]) => n === "RUC Proveedor" && v === RUC_PROVEEDOR), 'RIDE factura: "Información adicional" muestra RUC Proveedor: 1003710272001');
    const filasNC = filasInfoAdicionalRide(infoNC);
    assert(filasNC.length === 1 && filasNC[0][0] === "RUC Proveedor" && filasNC[0][1] === RUC_PROVEEDOR, "RIDE nota de crédito: muestra RUC Proveedor");
    const pdf = await generarRide({
      ruc: RUC_EMISOR, razonSocial: "BOLAÑOS FLORES ALEXIS RUBEN", nombreComercial: "SUPER TIENDA GEEK",
      dirMatriz: "Cristobal Colón y Atahualpa", claveAcceso: "2409202601100371027200110010020000009991234567811",
      ambiente: "1", numeroFactura: "001-002-000000999", fechaEmision: fecha,
      numeroAutorizacion: "2409202601100371027200110010020000009991234567811", fechaAutorizacion: "2026-09-24T10:00:00-05:00",
      tipoIdentificacion: "05", identificacion: "1004129530", razonSocialComprador: "CLIENTE PRUEBA",
      totalConImpuestos: [{ codigo: "2", codigoPorcentaje: "4", tarifa: 15, baseImponible: 400, valor: 60 }],
      totalSinImpuestos: 400, totalDescuento: 0, total: 460, pagos,
      detalles: [{ codigo: "LAP-000001", descripcion: linea.descripcion, cantidad: 1, precioUnitario: 400, descuento: 0, total: 400 }],
      infoAdicional: infoFactura,
    });
    assert(pdf.length > 1000 && Buffer.from(pdf.slice(0, 5)).toString() === "%PDF-", "RIDE: el PDF se genera sin errores con el campo incluido");
  }

  if (fallos > 0) {
    console.error(`\n❌ rucProveedor.test.ts — ${fallos} aserción(es) fallida(s)`);
    process.exit(1);
  }
  console.log("\n✅ rucProveedor.test.ts — todos los asserts pasaron");
})().catch((e) => { console.error(e); process.exit(1); });

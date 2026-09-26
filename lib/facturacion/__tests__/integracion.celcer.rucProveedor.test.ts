/**
 * Integración contra celcer (ambiente de PRUEBAS del SRI) — "RUC Proveedor"
 * (Res. NAC-DGERCGC26-00000027, Ficha Técnica v2.34, Anexo 26).
 *
 * Ejecutar A PROPÓSITO (el corredor la omite por defecto):
 *   PRUEBAS_CON_RED=1 npm test integracion.celcer.rucProveedor
 *
 * Qué hace:
 *   1. Factura de $11.50 a CONSUMIDOR FINAL con infoAdicional compuesta por
 *      construirInfoAdicionalFactura(..., rucProveedor) — el mismo camino que
 *      emitirFactura().
 *   2. Nota de crédito sobre esa factura con infoAdicionalConRucProveedor() —
 *      el mismo camino que emitirNotaCredito().
 *   Cada una: XSD/validación previa → firma → recepción → autorización, y
 *   comprueba que el XML AUTORIZADO que devuelve el SRI trae el campo.
 *
 * Seguridad:
 *   - _guardaRed bloquea SIEMPRE si SRI_AMBIENTE=2 (producción).
 *   - No escribe en Airtable (solo LEE la firma activa, igual que la emisión).
 *   - Usa un secuencial aleatorio alto (9xxxxxxxx) solo en celcer, para no
 *     chocar con SRI_SECUENCIAL ni con corridas anteriores.
 *   - La NC en celcer referencia una factura de celcer: nada toca producción.
 */

import fs from "fs";
import path from "path";

import { construirFacturaXml }        from "../xml/construirFacturaXml";
import { assertXmlValidoSri }         from "../reglas/validacionXsd";
import { construirNotaCreditoXml }    from "../notaCredito/construirNotaCreditoXml";
import { assertNotaCreditoValida }    from "../notaCredito/validarNotaCredito";
import { construirLineaNotaCredito, calcularTotalesNotaCredito } from "../notaCredito/calculos";
import { construirInfoAdicionalFactura } from "../reglas/referenciaPago";
import { resolverRucProveedor, infoAdicionalConRucProveedor } from "../reglas/rucProveedor";
import { firmarXml }                  from "../firma/firmar";
import { enviarComprobante }          from "../sri/recepcion";
import { esperarAutorizacion }        from "../sri/cola";
import { generateAccessKey }          from "../claveAcceso";
import { getFacturacionConfig }       from "../config";
import { obtenerFirmaActiva }         from "../firma/resolverFirmaActiva";
import { ahoraEnEcuador }             from "../fechaEcuador";
import type { DetalleFactura, FacturaInput, Pago } from "../types/factura";
import { assertPruebaConRedPermitida } from "./_guardaRed";

function loadEnvLocal(): void {
  try {
    const content = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    for (const rawLine of content.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch { /* sin .env.local: se usan las variables del proceso */ }
}

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

async function enviarYAutorizar(etiqueta: string, xmlFirmado: string, claveAcceso: string, cfg: ReturnType<typeof getFacturacionConfig>) {
  const recepcion = await enviarComprobante(xmlFirmado, cfg);
  if (recepcion.estado === "DEVUELTA") {
    for (const m of recepcion.mensajes ?? []) console.error(`  [${m.identificador}] ${m.mensaje} ${m.informacionAdicional ?? ""}`);
    assert(false, `${etiqueta}: RECIBIDA por celcer`);
    return null;
  }
  assert(true, `${etiqueta}: RECIBIDA por celcer`);
  const aut = await esperarAutorizacion(claveAcceso, cfg, { maxEsperaMs: 60_000, intervaloBase: 2_000 });
  if (aut.estado !== "AUTORIZADO") {
    for (const m of ("mensajes" in aut ? aut.mensajes : []) ?? []) console.error(`  [${m.identificador}] ${m.mensaje} ${m.informacionAdicional ?? ""}`);
    assert(false, `${etiqueta}: AUTORIZADA por celcer (estado: ${aut.estado})`);
    return null;
  }
  assert(true, `${etiqueta}: AUTORIZADA por celcer (${aut.numeroAutorizacion})`);
  return aut;
}

(async () => {
  loadEnvLocal();
  assertPruebaConRedPermitida("integracion.celcer.rucProveedor");

  const cfg = getFacturacionConfig();
  if (cfg.ambiente !== "1") { console.error("❌ Solo se corre en celcer (SRI_AMBIENTE=1)."); process.exit(1); }

  const ruc   = resolverRucProveedor(cfg.ruc);
  const firma = await obtenerFirmaActiva();
  const fecha = ahoraEnEcuador();
  const secuencial = String(900_000_000 + Math.floor(Math.random() * 99_999_999)).padStart(9, "0");
  const numeroFactura = `${cfg.establecimiento}-${cfg.puntoEmision}-${secuencial}`;
  const campo = `nombre="RUC Proveedor">${ruc.ruc}<`;
  console.log(`RUC Proveedor: ${ruc.ruc} (origen: ${ruc.origen}) · serie ${numeroFactura} · firma: ${firma.origen}`);

  // ── 1. Factura ──────────────────────────────────────────────────────────────
  const BASE = 10, IVA = 1.5, TOTAL = 11.5;
  const linea: DetalleFactura = {
    codigoPrincipal: "SRV-PRUEBA-001", descripcion: "SERVICIO DE PRUEBA RUC PROVEEDOR", unidadMedida: "UNIDAD",
    cantidad: 1, precioUnitario: BASE, descuento: 0, precioTotalSinImpuesto: BASE,
    impuestos: [{ codigo: "2", codigoPorcentaje: "4", tarifa: 15, baseImponible: BASE, valor: IVA }],
  };
  const pagos: Pago[] = [{ formaPago: "01", total: TOTAL }];
  const claveFactura = generateAccessKey({
    fechaEmision: fecha, tipoComprobante: "01", ruc: cfg.ruc, ambiente: cfg.ambiente,
    establecimiento: cfg.establecimiento, puntoEmision: cfg.puntoEmision, secuencial,
  });
  const facturaInput: FacturaInput = {
    ambiente: cfg.ambiente, razonSocial: cfg.razonSocial, nombreComercial: cfg.nombreComercial, ruc: cfg.ruc,
    claveAcceso: claveFactura, estab: cfg.establecimiento, ptoEmi: cfg.puntoEmision, secuencial, dirMatriz: cfg.dirMatriz,
    fechaEmision: fecha,
    ...(cfg.dirEstablecimiento ? { dirEstablecimiento: cfg.dirEstablecimiento } : {}),
    ...(cfg.obligadoContabilidad ? { obligadoContabilidad: cfg.obligadoContabilidad } : {}),
    tipoIdentificacionComprador: "07", razonSocialComprador: "CONSUMIDOR FINAL", identificacionComprador: "9999999999999",
    totalSinImpuestos: BASE, totalDescuento: 0,
    totalConImpuestos: [{ codigo: "2", codigoPorcentaje: "4", baseImponible: BASE, tarifa: 15, valor: IVA }],
    importeTotal: TOTAL, pagos, detalles: [linea],
    infoAdicional: construirInfoAdicionalFactura("Prueba celcer", undefined, pagos, ruc.ruc),
  };
  const xmlFactura = construirFacturaXml(facturaInput);
  assertXmlValidoSri(xmlFactura);
  assert(xmlFactura.includes(campo), "Factura: XML sin firmar trae RUC Proveedor y pasa el XSD");
  const firmadaFactura = await firmarXml({ xmlSinFirmar: xmlFactura, p12Path: firma.p12Path, p12Clave: firma.password });
  const autFactura = await enviarYAutorizar("Factura", firmadaFactura, claveFactura, cfg);
  if (autFactura) {
    assert(autFactura.xmlAutorizado.includes("RUC Proveedor") && autFactura.xmlAutorizado.includes(ruc.ruc),
      "Factura: el XML AUTORIZADO devuelto por el SRI contiene RUC Proveedor");
  }

  // ── 2. Nota de crédito sobre esa factura ────────────────────────────────────
  if (autFactura) {
    const det = construirLineaNotaCredito({ ...linea, tipo: "producto" }, 1, false);
    const tot = calcularTotalesNotaCredito([det]);
    const claveNC = generateAccessKey({
      fechaEmision: fecha, tipoComprobante: "04", ruc: cfg.ruc, ambiente: cfg.ambiente,
      establecimiento: cfg.establecimiento, puntoEmision: cfg.puntoEmision, secuencial,
    });
    const xmlNC = construirNotaCreditoXml({
      ambiente: cfg.ambiente, razonSocial: cfg.razonSocial, nombreComercial: cfg.nombreComercial, ruc: cfg.ruc,
      claveAcceso: claveNC, estab: cfg.establecimiento, ptoEmi: cfg.puntoEmision, secuencial, dirMatriz: cfg.dirMatriz,
      fechaEmision: fecha, dirEstablecimiento: cfg.dirEstablecimiento,
      // Una NC no admite consumidor final: se acredita a un RUC de prueba (el propio emisor).
      tipoIdentificacionComprador: "04", razonSocialComprador: cfg.razonSocial, identificacionComprador: cfg.ruc,
      obligadoContabilidad: cfg.obligadoContabilidad,
      codDocModificado: "01", numDocModificado: numeroFactura, fechaEmisionDocSustento: fecha,
      totalSinImpuestos: tot.totalSinImpuestos, valorModificacion: tot.valorModificacion, moneda: "DOLAR",
      totalConImpuestos: tot.totalConImpuestos, motivo: "Prueba celcer RUC Proveedor - devolucion de servicio",
      detalles: [det],
      infoAdicional: infoAdicionalConRucProveedor(undefined, cfg.ruc),
    });
    assertNotaCreditoValida(xmlNC);
    assert(xmlNC.includes(campo), "Nota de crédito: XML sin firmar trae RUC Proveedor y pasa la validación previa");
    const firmadaNC = await firmarXml({ xmlSinFirmar: xmlNC, p12Path: firma.p12Path, p12Clave: firma.password, tipo: "notaCredito" });
    const autNC = await enviarYAutorizar("Nota de crédito", firmadaNC, claveNC, cfg);
    if (autNC) {
      assert(autNC.xmlAutorizado.includes("RUC Proveedor") && autNC.xmlAutorizado.includes(ruc.ruc),
        "Nota de crédito: el XML AUTORIZADO devuelto por el SRI contiene RUC Proveedor");
    }
  }

  if (fallos > 0) { console.error(`\n❌ integracion.celcer.rucProveedor — ${fallos} fallo(s)`); process.exit(1); }
  console.log("\n✅ integracion.celcer.rucProveedor — factura y nota de crédito AUTORIZADAS en celcer con RUC Proveedor");
})().catch((e) => { console.error(e); process.exit(1); });

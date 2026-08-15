/**
 * Test de integración end-to-end contra el ambiente de pruebas (celcer) del SRI.
 *
 * Ejecutar:
 *   NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/integracion.celcer.test.ts
 *
 * Variables requeridas en .env.local:
 *   SRI_AMBIENTE=1
 *   SRI_RUC=<RUC 13 dígitos>
 *   SRI_RAZON_SOCIAL=<razón social>
 *   SRI_NOMBRE_COMERCIAL=<nombre comercial>      (opcional, default = SRI_RAZON_SOCIAL)
 *   SRI_DIR_MATRIZ=<dirección matriz>
 *   SRI_DIR_ESTABLECIMIENTO=<dirección local>    (opcional)
 *   SRI_OBLIGADO_CONTABILIDAD=SI|NO              (opcional)
 *   SRI_ESTABLECIMIENTO=001
 *   SRI_PUNTO_EMISION=001
 *   SRI_SECUENCIAL=<siguiente secuencial>
 *   SRI_FIRMA_PATH=<ruta absoluta al .p12>
 *   SRI_FIRMA_PASSWORD=<contraseña del .p12>
 *
 * El test imprime la respuesta SOAP COMPLETA del SRI en recepción y autorización.
 * No está en CI — requiere credenciales SRI del emisor registradas en celcer.
 */

import fs from "fs";
import path from "path";

import { construirFacturaXml }  from "../xml/construirFacturaXml";
import { firmarXml }            from "../firma/firmar";
import { enviarComprobante }    from "../sri/recepcion";
import { esperarAutorizacion }  from "../sri/cola";
import { generateAccessKey }    from "../claveAcceso";
import { getFacturacionConfig } from "../config";
import { obtenerFirmaActiva }   from "../firma/resolverFirmaActiva";
import type { FacturaInput }    from "../types/factura";
import { assertPruebaConRedPermitida } from "./_guardaRed";

// ─── Cargar .env.local ────────────────────────────────────────────────────────

function loadEnvLocal(): void {
  const envPath = path.join(process.cwd(), ".env.local");
  try {
    const content = fs.readFileSync(envPath, "utf8");
    for (const rawLine of content.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 1) continue;
      const key   = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch { /* .env.local ausente — se usan vars de process.env */ }
}

// ─── Verificar credenciales ───────────────────────────────────────────────────

const REQUIRED_VARS = [
  "SRI_RUC",
  "SRI_RAZON_SOCIAL",
  "SRI_DIR_MATRIZ",
  "SRI_ESTABLECIMIENTO",
  "SRI_PUNTO_EMISION",
  "SRI_SECUENCIAL",
  "SRI_FIRMA_PATH",
  "SRI_FIRMA_PASSWORD",
] as const;

function checkCredenciales(): boolean {
  const faltantes = REQUIRED_VARS.filter((k) => !process.env[k]?.trim());
  if (faltantes.length > 0) {
    console.log("⚠️  Test omitido — variables de entorno faltantes:");
    for (const k of faltantes) console.log(`   ${k}`);
    console.log("\nAgrega estas variables a .env.local y vuelve a ejecutar.");
    return false;
  }
  const p12 = process.env.SRI_FIRMA_PATH!;
  if (!fs.existsSync(p12)) {
    console.log(`⚠️  Test omitido — SRI_FIRMA_PATH no existe en disco: ${p12}`);
    return false;
  }
  return true;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function divider(title: string): void {
  const bar = "═".repeat(70);
  console.log(`\n${bar}\n  ${title}\n${bar}`);
}

// ─── Test principal ───────────────────────────────────────────────────────────

(async () => {
  loadEnvLocal();
  assertPruebaConRedPermitida("integracion.celcer");
  if (!checkCredenciales()) process.exit(0);

  const cfg = getFacturacionConfig();

  divider("CONFIGURACIÓN");
  console.log(`  Ambiente       : ${cfg.ambiente === "1" ? "PRUEBAS (celcer)" : "PRODUCCIÓN (cel)"}`);
  console.log(`  RUC            : ${cfg.ruc}`);
  console.log(`  Razón social   : ${cfg.razonSocial}`);
  console.log(`  Nombre comerc. : ${cfg.nombreComercial}`);
  console.log(`  Dir. Matriz    : ${cfg.dirMatriz}`);
  if (cfg.dirEstablecimiento)
    console.log(`  Dir. Estab.    : ${cfg.dirEstablecimiento}`);
  if (cfg.obligadoContabilidad)
    console.log(`  Oblig. Contab. : ${cfg.obligadoContabilidad}`);
  console.log(`  Serie          : ${cfg.establecimiento}-${cfg.puntoEmision}`);
  console.log(`  Secuencial     : ${cfg.secuencial}`);
  // La firma ya no vive en la config: se resuelve aparte (Airtable si hay una
  // cargada desde el portal, variables de entorno si no).
  const firma = await obtenerFirmaActiva();
  console.log(`  Firma (.p12)   : ${firma.p12Path}  [origen: ${firma.origen}]`);
  if (firma.metadatos) {
    console.log(`  Firma válida h.: ${firma.metadatos.validoHasta.toISOString().split("T")[0]}`);
  }

  // ── 1. Clave de acceso ────────────────────────────────────────────────────

  const fechaEmision = new Date();

  const claveAcceso = generateAccessKey({
    fechaEmision,
    tipoComprobante: "01",
    ruc:             cfg.ruc,
    ambiente:        cfg.ambiente,
    establecimiento: cfg.establecimiento,
    puntoEmision:    cfg.puntoEmision,
    secuencial:      cfg.secuencial,
  });

  console.log(`\n  Clave de acceso: ${claveAcceso}`);

  // ── 2. Factura mínima y cuadrada (Ficha Técnica 2.32) ────────────────────
  //
  //   Producto: 1 unidad × $10.00 = $10.00 (sin IVA)
  //   IVA 15%  codigoPorcentaje=4 → $10.00 × 15% = $1.50
  //   Total    $11.50
  //   Comprador: consumidor final (tipo 07 / 9999999999999)

  const BASE  = 10.00;
  const IVA   =  1.50;  // BASE * 0.15
  const TOTAL = 11.50;  // BASE + IVA

  const facturaInput: FacturaInput = {
    // infoTributaria
    ambiente:        cfg.ambiente,
    razonSocial:     cfg.razonSocial,
    nombreComercial: cfg.nombreComercial,
    ruc:             cfg.ruc,
    claveAcceso,
    estab:           cfg.establecimiento,
    ptoEmi:          cfg.puntoEmision,
    secuencial:      cfg.secuencial,
    dirMatriz:       cfg.dirMatriz,

    // infoFactura
    fechaEmision,
    ...(cfg.dirEstablecimiento
      ? { dirEstablecimiento: cfg.dirEstablecimiento }
      : {}),
    ...(cfg.obligadoContabilidad
      ? { obligadoContabilidad: cfg.obligadoContabilidad }
      : {}),

    // consumidor final
    tipoIdentificacionComprador: "07",
    razonSocialComprador:        "CONSUMIDOR FINAL",
    identificacionComprador:     "9999999999999",

    // totales cuadrados
    totalSinImpuestos: BASE,
    totalDescuento:    0.00,
    totalConImpuestos: [
      {
        codigo:           "2",   // IVA
        codigoPorcentaje: "4",   // 15 % (catálogo SRI vigente 2024+)
        baseImponible:    BASE,
        tarifa:           15,
        valor:            IVA,
      },
    ],
    importeTotal: TOTAL,
    pagos: [{ formaPago: "01", total: TOTAL }],   // efectivo / contado

    // detalle
    detalles: [
      {
        codigoPrincipal:        "SRV-PRUEBA-001",
        descripcion:            "SERVICIO DE PRUEBA AMBIENTE CELCER",
        unidadMedida:           "UNIDAD",
        cantidad:               1.00,
        precioUnitario:         BASE,
        descuento:              0.00,
        precioTotalSinImpuesto: BASE,
        impuestos: [
          {
            codigo:           "2",
            codigoPorcentaje: "4",   // 15 %
            tarifa:           15,
            baseImponible:    BASE,
            valor:            IVA,
          },
        ],
      },
    ],

    infoAdicional: [
      { nombre: "ambiente-test", valor: "celcer" },
      { nombre: "ts",            valor: fechaEmision.toISOString() },
    ],
  };

  divider("PASO 1 — Construir XML");
  const xmlSinFirmar = construirFacturaXml(facturaInput);
  console.log(`  XML generado   : ${xmlSinFirmar.length} bytes`);

  divider("PASO 2 — Firmar con .p12");
  const xmlFirmado = await firmarXml({
    xmlSinFirmar,
    p12Path:  firma.p12Path,
    p12Clave: firma.password,
  });
  console.log(`  XML firmado    : ${xmlFirmado.length} bytes`);
  console.log(`  ds:Signature   : ${xmlFirmado.includes("ds:Signature") ? "✅ presente" : "❌ ausente"}`);

  // ── 3. Recepción ──────────────────────────────────────────────────────────

  divider("PASO 3 — RecepcionComprobantesOffline");
  console.log(`  Endpoint: ${cfg.endpointRecepcion}\n`);

  const recepcion = await enviarComprobante(xmlFirmado, cfg);

  console.log("── Respuesta SOAP del SRI (recepción) ──");
  console.log(recepcion._rawSoap);
  console.log("\n── Resultado parseado ──");
  console.log(JSON.stringify(
    { estado: recepcion.estado, claveAcceso: recepcion.claveAcceso,
      ...("mensajes" in recepcion ? { mensajes: recepcion.mensajes } : {}) },
    null, 2
  ));

  if (recepcion.estado === "DEVUELTA") {
    console.log("\n❌  DEVUELTA — errores reportados por el SRI:");
    for (const m of recepcion.mensajes) {
      console.log(`  [${m.identificador}] ${m.tipo}: ${m.mensaje}`);
      if (m.informacionAdicional) console.log(`     → ${m.informacionAdicional}`);
    }
    process.exit(1);
  }

  console.log("\n✅  RECIBIDA");

  // ── 4. Autorización (con backoff si EN PROCESAMIENTO) ─────────────────────

  divider("PASO 4 — AutorizacionComprobantesOffline");
  console.log(`  Endpoint: ${cfg.endpointAutorizacion}`);
  console.log(`  Clave   : ${claveAcceso}`);
  console.log("  Esperando autorización (máx 60 s)…\n");

  const autorizacion = await esperarAutorizacion(claveAcceso, cfg, {
    maxEsperaMs:   60_000,
    intervaloBase:  2_000,
  });

  console.log("── Respuesta SOAP del SRI (autorización) ──");
  console.log(autorizacion._rawSoap);
  console.log("\n── Resultado parseado ──");
  console.log(JSON.stringify(
    {
      estado: autorizacion.estado,
      ...("numeroAutorizacion" in autorizacion
        ? {
            numeroAutorizacion: autorizacion.numeroAutorizacion,
            fechaAutorizacion:  autorizacion.fechaAutorizacion,
            ambiente:           autorizacion.ambiente,
            mensajes:           autorizacion.mensajes,
          }
        : {}),
      ...("mensajes" in autorizacion && autorizacion.estado === "NO AUTORIZADO"
        ? { mensajes: autorizacion.mensajes }
        : {}),
    },
    null, 2
  ));

  // ── 5. Resultado final ────────────────────────────────────────────────────

  divider("RESULTADO FINAL");

  if (autorizacion.estado === "AUTORIZADO") {
    console.log("🎉  AUTORIZADO");
    console.log(`  Nro. autorización : ${autorizacion.numeroAutorizacion}`);
    console.log(`  Fecha autorización: ${autorizacion.fechaAutorizacion}`);
    console.log(`  Ambiente SRI      : ${autorizacion.ambiente}`);
    if (autorizacion.mensajes.length > 0) {
      console.log("  Mensajes:");
      for (const m of autorizacion.mensajes)
        console.log(`    [${m.identificador}] ${m.mensaje}`);
    }
    console.log("\n✅  integracion.celcer.test.ts — FASE 3 COMPLETA");
  } else {
    console.log(`❌  ${autorizacion.estado}`);
    if ("mensajes" in autorizacion) {
      for (const m of autorizacion.mensajes)
        console.log(`  [${m.identificador}] ${m.tipo}: ${m.mensaje}`);
    }
    process.exit(1);
  }
})();

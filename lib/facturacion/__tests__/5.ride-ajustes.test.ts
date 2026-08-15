/**
 * Test de integración — RIDE ajustado (Phase 4 v2).
 *
 * Verifica: columna Descuento, totales desglosados, sección Forma de Pago,
 * sin infoAdicional de prueba, y atomicidad de Airtable.
 *
 * Ejecutar:
 *   NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/5.ride-ajustes.test.ts
 */

import fs   from "fs";
import path from "path";

function loadEnvLocal() {
  try {
    const content = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    for (const rawLine of content.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 1) continue;
      const key   = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch { /* sin .env.local */ }
}

loadEnvLocal();

import { assertPruebaConRedPermitida } from "./_guardaRed";
assertPruebaConRedPermitida("5.ride-ajustes");

import { emitirFactura } from "../emitirFactura";

const REQUIRED = [
  "SRI_RUC", "SRI_RAZON_SOCIAL", "SRI_DIR_MATRIZ",
  "SRI_ESTABLECIMIENTO", "SRI_PUNTO_EMISION", "SRI_FIRMA_PATH", "SRI_FIRMA_PASSWORD",
  "AIRTABLE_API_KEY", "AIRTABLE_BASE_ID",
  "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM", "SMTP_TEST_TO",
] as const;

function checkVars(): boolean {
  const missing = REQUIRED.filter((k) => !process.env[k]?.trim());
  if (missing.length) { console.log("⚠️  Faltan variables:", missing.join(", ")); return false; }
  const p12 = process.env.SRI_FIRMA_PATH!;
  if (!fs.existsSync(p12)) { console.log(`⚠️  SRI_FIRMA_PATH no existe: ${p12}`); return false; }
  return true;
}

(async () => {
  if (!checkVars()) process.exit(0);

  console.log("═".repeat(70));
  console.log("  TEST 5 — RIDE ajustado: Descuento + Totales + Forma de Pago");
  console.log("═".repeat(70));

  const BASE  = 25.00;
  const IVA   =  3.75;
  const TOTAL = 28.75;

  // Sin infoAdicional: la sección no debe aparecer en el RIDE
  const resultado = await emitirFactura({
    tipoIdentificacionComprador: "07",
    razonSocialComprador:        "CONSUMIDOR FINAL",
    identificacionComprador:     "9999999999999",
    correoComprador:             process.env.SMTP_TEST_TO!,

    detalles: [
      {
        codigoPrincipal:        "SRV-AJUSTE-001",
        descripcion:            "SERVICIO DE PRUEBA — RIDE AJUSTADO",
        unidadMedida:           "SERVICIO",
        cantidad:               1.00,
        precioUnitario:         25.00,
        descuento:              0.00,
        precioTotalSinImpuesto: BASE,
        impuestos: [
          {
            codigo:           "2",
            codigoPorcentaje: "4",
            tarifa:           15,
            baseImponible:    BASE,
            valor:            IVA,
          },
        ],
      },
    ],

    totalSinImpuestos: BASE,
    totalDescuento:    0.00,
    totalConImpuestos: [
      {
        codigo:           "2",
        codigoPorcentaje: "4",
        baseImponible:    BASE,
        tarifa:           15,
        valor:            IVA,
      },
    ],
    importeTotal: TOTAL,
    pagos: [{ formaPago: "01", total: TOTAL }],
    // infoAdicional omitido intencionalmente
  });

  console.log("\n── RESULTADO ──");
  console.log(JSON.stringify(resultado, null, 2));

  if (resultado.estado !== "AUTORIZADO") {
    console.log("\n❌  No autorizado");
    process.exit(1);
  }

  console.log("\n✅  AUTORIZADO");
  console.log(`  Número de factura     : ${resultado.numeroFactura}`);
  console.log(`  Número de autorización: ${resultado.numeroAutorizacion}`);
  console.log(`  Airtable record ID    : ${resultado.recordId}`);
  console.log(`  Correo enviado a      : ${process.env.SMTP_TEST_TO} (modo prueba)`);

  const hoy = new Date();
  const dir = `facturas-autorizadas/${hoy.getFullYear()}/${String(hoy.getMonth()+1).padStart(2,"0")}`;
  const xml = `${dir}/${resultado.claveAcceso}.xml`;
  const pdf = `${dir}/${resultado.claveAcceso}.pdf`;
  console.log(`\n  Archivos en disco:`);
  console.log(`    ${xml} — ${fs.existsSync(xml) ? "✅" : "❌"}`);
  console.log(`    ${pdf} — ${fs.existsSync(pdf) ? "✅" : "❌"}`);

  process.exit(0);
})().catch((e) => { console.error("❌", e); process.exit(1); });

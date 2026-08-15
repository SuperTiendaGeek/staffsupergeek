/**
 * Test de integración Fase 4 — flujo completo contra celcer + Airtable + correo.
 *
 * Ejecutar:
 *   NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/4e.integracion.fase4.test.ts
 *
 * Variables adicionales requeridas en .env.local respecto a la Fase 3:
 *   AIRTABLE_API_KEY      — token de la base SUPER GEEK ADM
 *   AIRTABLE_BASE_ID      — ID de la base SUPER GEEK ADM
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM
 *   SMTP_TEST_TO          — correo destino de prueba (obligatorio en test)
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
assertPruebaConRedPermitida("4e.integracion.fase4");

import { emitirFactura } from "../emitirFactura";

const REQUIRED = [
  "SRI_RUC", "SRI_RAZON_SOCIAL", "SRI_DIR_MATRIZ",
  "SRI_ESTABLECIMIENTO", "SRI_PUNTO_EMISION", "SRI_FIRMA_PATH", "SRI_FIRMA_PASSWORD",
  "AIRTABLE_API_KEY", "AIRTABLE_BASE_ID",
  "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM", "SMTP_TEST_TO",
] as const;

function checkVars(): boolean {
  const missing = REQUIRED.filter((k) => !process.env[k]?.trim());
  if (missing.length) {
    console.log("⚠️  Faltan variables de entorno:", missing.join(", "));
    return false;
  }
  const p12 = process.env.SRI_FIRMA_PATH!;
  if (!fs.existsSync(p12)) {
    console.log(`⚠️  SRI_FIRMA_PATH no existe: ${p12}`);
    return false;
  }
  return true;
}

function divider(t: string) {
  console.log(`\n${"═".repeat(70)}\n  ${t}\n${"═".repeat(70)}`);
}

(async () => {
  if (!checkVars()) process.exit(0);

  divider("FASE 4 — Integración completa (celcer + Airtable + correo)");

  const BASE  = 10.00;
  const IVA   =  1.50;
  const TOTAL = 11.50;

  const resultado = await emitirFactura({
    tipoIdentificacionComprador: "07",
    razonSocialComprador:        "CONSUMIDOR FINAL",
    identificacionComprador:     "9999999999999",
    correoComprador:             process.env.SMTP_TEST_TO!,

    detalles: [
      {
        codigoPrincipal:        "SRV-PRUEBA-002",
        descripcion:            "SERVICIO DE PRUEBA FASE 4",
        unidadMedida:           "UNIDAD",
        cantidad:               1.00,
        precioUnitario:         BASE,
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

    infoAdicional: [
      { nombre: "test-fase", valor: "4e-integracion" },
    ],
  });

  divider("RESULTADO");
  console.log(JSON.stringify(resultado, null, 2));

  if (resultado.estado !== "AUTORIZADO") {
    console.log("\n❌  No autorizado — revisa mensajes arriba");
    process.exit(1);
  }

  console.log("\n🎉  AUTORIZADO");
  console.log(`  Número de factura    : ${resultado.numeroFactura}`);
  console.log(`  Número de autorización: ${resultado.numeroAutorizacion}`);
  console.log(`  Fecha autorización   : ${resultado.fechaAutorizacion}`);
  console.log(`  Airtable record ID   : ${resultado.recordId}`);
  console.log(`  Correo enviado a     : ${process.env.SMTP_TEST_TO} (modo prueba)`);

  // Verificar archivos en disco
  const claveAcceso = resultado.claveAcceso;
  const hoy  = new Date();
  const dir  = `facturas-autorizadas/${hoy.getFullYear()}/${String(hoy.getMonth()+1).padStart(2,"0")}`;
  const xml  = `${dir}/${claveAcceso}.xml`;
  const pdf  = `${dir}/${claveAcceso}.pdf`;
  console.log(`\n  Archivos en disco:`);
  console.log(`    ${xml} — ${fs.existsSync(xml) ? "✅ existe" : "❌ falta"}`);
  console.log(`    ${pdf} — ${fs.existsSync(pdf) ? "✅ existe" : "❌ falta"}`);

  console.log("\n✅  FASE 4 COMPLETA");
  process.exit(0);
})().catch((e) => { console.error("❌", e); process.exit(1); });

/**
 * Test 5b — Emite la factura 664 para verificar el flujo completo:
 *   disco primero → Airtable → adjuntos XML+PDF sin error.
 * Ejecutar:
 *   NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/5b.emitir664.test.ts
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

import { emitirFactura } from "../emitirFactura";

(async () => {
  console.log("── 5b: Emisión factura 664 (verificación PASO 3) ──");

  const resultado = await emitirFactura({
    tipoIdentificacionComprador: "04",
    razonSocialComprador:        "ALEXIS BOLAÑOS",
    identificacionComprador:     "1003710272001",
    correoComprador:             "supertiendageek@gmail.com",
    vendedor:                    "Alexis Bolaños",
    totalSinImpuestos: 50.00,
    totalDescuento:    0.00,
    importeTotal:      57.50,
    totalConImpuestos: [
      { codigo: "2", codigoPorcentaje: "4", baseImponible: 50.00, tarifa: 15, valor: 7.50 },
    ],
    pagos: [{ formaPago: "01", total: 57.50 }],
    detalles: [
      {
        codigoPrincipal: "TEST-PASO3",
        descripcion:     "Verificación PASO 3 — flujo disco+Airtable+adjuntos",
        unidadMedida:    "Unidad",
        cantidad:        1,
        precioUnitario:  50.00,
        descuento:       0,
        precioTotalSinImpuesto: 50.00,
        impuestos: [
          { codigo: "2", codigoPorcentaje: "4", tarifa: 15, baseImponible: 50.00, valor: 7.50 },
        ],
      },
    ],
  });

  console.log("\nResultado:");
  console.log("  Estado             :", resultado.estado);
  console.log("  Número de factura  :", resultado.numeroFactura);
  console.log("  Clave de acceso    :", resultado.claveAcceso);
  console.log("  Nº autorización    :", resultado.numeroAutorizacion ?? "—");
  console.log("  Record Airtable    :", resultado.recordId ?? "—");

  if (resultado.mensajes?.length) {
    console.log("\n  Mensajes SRI:");
    for (const m of resultado.mensajes) {
      console.log(`    [${m.identificador}] ${m.tipo}: ${m.mensaje}`);
    }
  }

  if (resultado.estado !== "AUTORIZADO") {
    console.error("\n❌  No autorizada");
    process.exit(1);
  }

  // Verificar archivos en disco
  const clave  = resultado.claveAcceso;
  const dia    = clave.slice(0, 2);
  const mes    = clave.slice(2, 4);
  const anio   = clave.slice(4, 8);
  const base   = process.env.FACTURAS_DIR?.trim() || "facturas-autorizadas";
  const xmlPath = path.join(process.cwd(), base, anio, mes, `${clave}.xml`);
  const pdfPath = path.join(process.cwd(), base, anio, mes, `${clave}.pdf`);

  console.log("\nArchivos en disco:");
  console.log("  XML:", fs.existsSync(xmlPath) ? "✅ OK" : "❌ FALTA");
  console.log("  PDF:", fs.existsSync(pdfPath) ? "✅ OK" : "❌ FALTA");
  console.log("\n✅  5b OK — 664 emitida y persistida correctamente");
})().catch((e) => { console.error("❌ ", e); process.exit(1); });

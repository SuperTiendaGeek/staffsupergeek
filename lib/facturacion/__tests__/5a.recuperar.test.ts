/**
 * Test 5a — Recupera la factura 663 del SRI y la persiste en disco + Airtable.
 * Ejecutar:
 *   NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/5a.recuperar.test.ts
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
assertPruebaConRedPermitida("5a.recuperar");

import { recuperarFacturaAutorizadaPorClave } from "../almacenamiento/recuperar";

const CLAVE_663 = "2306202601100371027200110010020000006636893832213";

(async () => {
  console.log("── 5a: Recuperar factura 663 del SRI ──");
  console.log(`  Clave: ${CLAVE_663}`);
  console.log("  Consultando al SRI...\n");

  const resultado = await recuperarFacturaAutorizadaPorClave(CLAVE_663);

  console.log("✅  Recuperación completada:");
  console.log(`  Número de factura : ${resultado.numeroFactura}`);
  console.log(`  Record Airtable   : ${resultado.recordId}`);
  console.log(`  En disco          : ${resultado.enDisco}`);
  console.log(`  Ya estaba Airtable: ${resultado.enAirtable}`);
  console.log(`  Adjuntos subidos  : ${resultado.adjuntosSubidos}`);
})().catch((e) => { console.error("❌ ", e); process.exit(1); });

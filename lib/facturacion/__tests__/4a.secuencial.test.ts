/**
 * Test 4a — Lee el máximo secuencial AUTORIZADO de Airtable y calcula el siguiente.
 * Ejecutar:
 *   NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/4a.secuencial.test.ts
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

import { maxSecuencialAutorizado } from "../airtable/facturas";
import { siguienteSecuencial }     from "../secuencial/asignar";
import { getFacturacionConfig }    from "../config";

(async () => {
  const cfg = getFacturacionConfig();

  console.log("── 4a: Lectura de máximo secuencial en Airtable ──");
  console.log(`  Tabla : Facturas Electrónicas (base: ${process.env.AIRTABLE_BASE_ID})`);
  console.log(`  Serie : ${cfg.establecimiento}-${cfg.puntoEmision}`);

  const maxActual = await maxSecuencialAutorizado(cfg.establecimiento, cfg.puntoEmision);
  console.log(`  Máx. secuencial AUTORIZADO en Airtable: ${maxActual ?? "(ninguno)"}`);

  const { secuencial, numeroFactura } = await siguienteSecuencial(
    cfg.establecimiento,
    cfg.puntoEmision
  );
  console.log(`  Siguiente secuencial : ${secuencial}`);
  console.log(`  Número de factura    : ${numeroFactura}`);
  console.log("\n✅  4a OK");
})().catch((e) => { console.error("❌ ", e); process.exit(1); });

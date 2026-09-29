/**
 * Recalcula el reparto de flete/arancel/otros de los packings que TODAVÍA NO
 * se han recibido (En Proceso, Cerrado, En tránsito), con la regla corregida
 * de lib/shipping-v2/packing-reparto.ts.
 *
 * Los packings ya recibidos NO se tocan (decisión de negocio, sept. 2026):
 * conservan la fórmula heredada de Airtable. Ver packing-reparto.ts.
 *
 * USO
 *   # 1) Vista previa (NO escribe nada):
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/recalcular-costos-packings.ts
 *
 *   # 2) Un solo packing:
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/recalcular-costos-packings.ts --packing=PK-20260928-97012
 *
 *   # 3) Escribir (después de revisar la vista previa):
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/recalcular-costos-packings.ts --aplicar
 *
 *   # 4) Verificación: volver a correr la vista previa → debe decir 0 cambios.
 *
 * Se puede correr las veces que haga falta: lo que ya cuadra no se reescribe.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

const APLICAR = process.argv.includes("--aplicar");
const SOLO_PACKING = process.argv.find((a) => a.startsWith("--packing="))?.split("=")[1]?.trim().toUpperCase() ?? null;
const ESTADOS_OBJETIVO = new Set(["en proceso", "cerrado", "en transito"]);
const PAUSA_MS = 400; // Airtable: 5 peticiones por segundo por base.

async function cargarEnvLocal(): Promise<void> {
  const raw = await readFile(path.join(process.cwd(), ".env.local"), "utf8").catch(() => "");
  for (const linea of raw.split(/\r?\n/)) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith("#")) continue;
    const corte = limpia.indexOf("=");
    if (corte < 1) continue;
    const clave = limpia.slice(0, corte).trim();
    let valor = limpia.slice(corte + 1).trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) valor = valor.slice(1, -1);
    process.env[clave] ||= valor;
  }
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const normalizar = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const dinero = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? `$${v.toFixed(2)}` : "—");

async function main() {
  await cargarEnvLocal();
  // Import dinámico: airtable.ts lee las variables de entorno al usarse.
  const { getShippingV2Packings, recalcularCostosShippingV2Packing } = await import("../lib/shipping-v2/airtable");
  const { systemShippingV2Access } = await import("../lib/shipping-v2/access");
  const access = systemShippingV2Access();

  const packings = (await getShippingV2Packings(access))
    .filter((p) => ESTADOS_OBJETIVO.has(normalizar(p.estado)))
    .filter((p) => !SOLO_PACKING || p.packingId.toUpperCase() === SOLO_PACKING);

  console.log(`${APLICAR ? "APLICANDO" : "VISTA PREVIA (no escribe)"} — ${packings.length} packing(s) no recibidos.\n`);
  let totalCambios = 0;
  let omitidos = 0;

  for (const packing of packings) {
    const r = await recalcularCostosShippingV2Packing(packing.id, {
      registradoPor: "Script recalcular-costos-packings",
      vistaPrevia: !APLICAR,
      access,
      motivo: "Corrección del reparto por costo/cantidad (subtotal proveedor × unidades).",
    });
    if (r.estado === "omitido") {
      omitidos++;
      console.log(`⚠ ${r.packingId} (${packing.estado}): OMITIDO — ${r.motivo}\n`);
      await esperar(PAUSA_MS);
      continue;
    }
    const t = r.reparto.totales;
    console.log(
      `${r.packingId} (${packing.estado}) · regla ${packing.reglaDistribucionCostos || "—"} · flete ${dinero(t.flete)} · arancel ${dinero(t.arancel)} · otros ${dinero(t.otros)} · ${t.unidades} u · subtotal ${dinero(t.subtotalProveedor)} · ${r.cambios.length} cambio(s)`
    );
    for (const c of r.cambios) {
      console.log(
        `   ${c.sku.padEnd(12)} ${String(c.despues.unidades).padStart(3)} u | flete/u ${dinero(c.antes.fletePorUnidad)} → ${dinero(c.despues.fletePorUnidad)} ` +
        `| flete registro ${dinero(c.despues.flete)} | total unidad ${dinero(c.antes.totalUnidad)} → ${dinero(c.despues.totalUnidad)}`
      );
    }
    for (const a of r.reparto.advertencias) console.log(`   ⚠ ${a}`);
    console.log("");
    totalCambios += r.cambios.length;
    await esperar(PAUSA_MS);
  }

  console.log(`Resumen: ${totalCambios} registro(s) ${APLICAR ? "actualizados" : "por actualizar"}, ${omitidos} packing(s) omitidos.`);
  if (!APLICAR && totalCambios > 0) console.log("Revisa la lista y vuelve a correr con --aplicar para escribir.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

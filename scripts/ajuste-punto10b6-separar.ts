/**
 * Ajuste de datos de UNA SOLA VEZ para el punto 10b-6 de la auditoría Shipping V2,
 * aprobado por el dueño el 18-oct-2026: los equipos registrados como varias
 * unidades en un solo registro pasan a un registro por equipo, con el MISMO SKU.
 *
 * Usa la misma función que el botón "Separar 1 unidad" (separarUnaUnidadShippingV2):
 * cada unidad nueva se lleva su parte exacta de flete, arancel y otros, sus
 * unidades compradas y los vínculos de compra (orden, pago, caja): el total de
 * la compra no cambia. Hereda la inspección con una nota. Las series se
 * escanean después desde el detalle de cada unidad (no son requisito para vender).
 * Al final marca "Seguimiento = Unidad" en todos.
 *
 * Antes, ya hechos a mano por Claude el 18-oct (aprobados): LAP-000100 → DES-000038
 * (categoría Desktop) y OTR-000164 → categoría Accesorio, por lote (no se separa).
 *
 * USO
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-punto10b6-separar.ts            # vista previa
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-punto10b6-separar.ts --aplicar   # escribir
 *   (después, la vista previa debe decir que no queda nada por separar)
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

/** Los 7 registros aprobados (18-oct). Nada más se toca. */
const REGISTROS: Array<{ id: string; sku: string; esperado: number }> = [
  { id: "rec8XEqYZhfKNfpgK", sku: "LAP-000076", esperado: 9 },
  { id: "recQ7ewPB8kMDyl6H", sku: "DES-000028", esperado: 3 },
  { id: "recD4iOFq0SbpUrgw", sku: "OTR-000161", esperado: 2 },
  { id: "rec345LLhs23Wfs7z", sku: "DES-000037", esperado: 3 },
  { id: "recSxksfdiMxb3AZE", sku: "LAP-000097", esperado: 2 },
  { id: "recDmNK20sonSDBmW", sku: "DES-000038", esperado: 2 },
  { id: "recag2QPdhIpzMcnj", sku: "LAP-000101", esperado: 2 },
];

const APLICAR = process.argv.includes("--aplicar");
const ACTOR = "Ajuste 10b-6 (aprobado por el dueño)";
const MOTIVO = "Un registro por equipo (punto 10b-6, aprobado por el dueño el 18-oct-2026)";

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

async function main() {
  await cargarEnvLocal();
  const token = process.env.AIRTABLE_API_KEY?.trim();
  const baseId = process.env.AIRTABLE_BASE_ID?.trim();
  if (!token || !baseId) throw new Error("Faltan AIRTABLE_API_KEY / AIRTABLE_BASE_ID en .env.local");
  // Después de leer .env.local: el módulo de Airtable usa esas variables.
  const { getShippingV2ItemById, separarUnaUnidadShippingV2 } = await import("../lib/shipping-v2/airtable");
  const { systemShippingV2Access } = await import("../lib/shipping-v2/access");
  const { unidadesLibres } = await import("../lib/shipping-v2/unidades");
  const access = { ...systemShippingV2Access(), isSiteAdmin: true };

  const plan: Array<{ id: string; sku: string; cantidad: number; separables: number }> = [];
  for (const r of REGISTROS) {
    const item = await getShippingV2ItemById(r.id, { includeAiName: false, access });
    const cantidad = Math.floor(item.cantidad ?? 0);
    const libres = unidadesLibres({ cantidad: item.cantidad, cantidadReservada: item.cantidadReservada, reservado: item.reservado });
    const separables = Math.max(0, Math.min(cantidad - 1, libres));
    console.log(`${item.sku.padEnd(11)} ${String(cantidad).padStart(2)} u. · ${item.estado}${(item.cantidadReservada ?? 0) > 0 ? ` · ${item.cantidadReservada} reservada(s)` : ""} → se crean ${separables}`);
    if (item.sku !== r.sku) throw new Error(`${r.id} ahora tiene SKU ${item.sku} (se esperaba ${r.sku}). No se aplica nada: revisar.`);
    if (cantidad > r.esperado) throw new Error(`${r.sku} tiene ${cantidad} unidades (se esperaban ${r.esperado} o menos). No se aplica nada: revisar.`);
    if (separables > 0) plan.push({ id: r.id, sku: item.sku, cantidad, separables });
  }
  const total = plan.reduce((n, p) => n + p.separables, 0);
  console.log(`\nRegistros nuevos a crear: ${total}.`);
  if (!APLICAR) {
    console.log("Vista previa: no se escribió nada. Para aplicar: --aplicar");
    return;
  }

  const urlItems = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent("Shipping Items")}`;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const unidades: string[] = REGISTROS.map((r) => r.id);
  for (const p of plan) {
    for (let i = 0; i < p.separables; i++) {
      const r = await separarUnaUnidadShippingV2(p.id, { actor: ACTOR, access, motivo: MOTIVO });
      unidades.push(r.nuevoId);
      console.log(`  ${p.sku}: unidad ${i + 1}/${p.separables} → ${r.nuevoId}`);
    }
  }
  // Todas (originales y nuevas) quedan como "Unidad".
  for (let i = 0; i < unidades.length; i += 10) {
    const lote = unidades.slice(i, i + 10);
    const res = await fetch(urlItems, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ records: lote.map((id) => ({ id, fields: { Seguimiento: "Unidad" } })) }),
    });
    if (!res.ok) throw new Error(`No se pudo marcar Seguimiento = Unidad (lote ${i / 10 + 1}): ${res.status} ${await res.text()}`);
  }
  console.log(`\n✅ Se crearon ${unidades.length - REGISTROS.length} unidades y ${unidades.length} quedaron como "Unidad". Vuelve a correr la vista previa: debe decir 0.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

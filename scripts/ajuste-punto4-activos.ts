/**
 * Ajuste de datos de UNA SOLA VEZ para el punto 4 de la auditoría Shipping V2
 * (Activos de la tienda), aprobado por el dueño el 8-oct-2026. Reglas en
 * lib/shipping-v2/ajuste-punto4.ts (con pruebas).
 *
 * USO
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-punto4-activos.ts            # vista previa
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-punto4-activos.ts --aplicar   # escribir
 *   (después, la vista previa debe decir 0 cambios)
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { planAjustePunto4, type CambioAjuste4 } from "../lib/shipping-v2/ajuste-punto4";

/** Tope de seguridad: hoy se esperan 7 cambios (6 SSD y OTR-000185). */
const TOPE_CAMBIOS = 15;

const APLICAR = process.argv.includes("--aplicar");
const PAUSA_MS = 250;

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
const texto = (v: unknown) => (typeof v === "string" ? v : "");

async function listar(url: string, headers: Record<string, string>, campos: string[]) {
  const registros: Array<{ id: string; fields: Record<string, unknown> }> = [];
  let offset: string | undefined;
  do {
    const params = new URLSearchParams({ pageSize: "100" });
    for (const campo of campos) params.append("fields[]", campo);
    if (offset) params.set("offset", offset);
    const res = await fetch(`${url}?${params}`, { headers });
    if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { records: Array<{ id: string; fields: Record<string, unknown> }>; offset?: string };
    registros.push(...data.records);
    offset = data.offset;
    await esperar(PAUSA_MS);
  } while (offset);
  return registros;
}

async function main() {
  await cargarEnvLocal();
  const token = process.env.AIRTABLE_API_KEY?.trim();
  const baseId = process.env.AIRTABLE_BASE_ID?.trim();
  if (!token || !baseId) throw new Error("Faltan AIRTABLE_API_KEY / AIRTABLE_BASE_ID en .env.local");
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const urlItems = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent("Shipping Items")}`;

  const items = await listar(urlItems, headers, ["SKU", "Tipo de operación", "Estado Item", "Es uso local", "Recibido", "Origen del artículo"]);
  const cambios: CambioAjuste4[] = [];
  for (const r of items) {
    const f = r.fields;
    const cambio = planAjustePunto4({
      id: r.id,
      sku: texto(f["SKU"]) || r.id,
      tipoOperacion: texto(f["Tipo de operación"]),
      estado: texto(f["Estado Item"]),
      esUsoLocal: f["Es uso local"] === true,
      recibido: f["Recibido"] === true,
      origenArticulo: texto(f["Origen del artículo"]),
    });
    if (cambio) cambios.push(cambio);
  }

  console.log(`Artículos leídos: ${items.length}. Con cambios: ${cambios.length}.`);
  for (const c of cambios) console.log(`${c.sku.padEnd(12)} ${c.resumen.join(" · ")}`);
  if (cambios.length > TOPE_CAMBIOS) {
    throw new Error(`Se esperaban como mucho ${TOPE_CAMBIOS} cambios y salen ${cambios.length}. No se aplica nada: revisar.`);
  }
  if (!APLICAR) {
    console.log("\nVista previa: no se escribió nada. Para aplicar: --aplicar");
    return;
  }
  let hechos = 0;
  for (let i = 0; i < cambios.length; i += 10) {
    const lote = cambios.slice(i, i + 10);
    const res = await fetch(urlItems, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ records: lote.map((c) => ({ id: c.id, fields: c.fields })), typecast: true }),
    });
    if (!res.ok) throw new Error(`Falló el lote ${i / 10 + 1} (${hechos} ya aplicados): ${res.status} ${await res.text()}`);
    hechos += lote.length;
    await esperar(PAUSA_MS);
  }
  console.log(`\n✅ Aplicados ${hechos} cambios. Vuelve a correr la vista previa: debe decir 0.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

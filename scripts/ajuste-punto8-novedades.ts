/**
 * Ajuste de datos de UNA SOLA VEZ para el punto 8 de la auditoría Shipping V2
 * (Novedades), aprobado por el dueño el 10-oct-2026. Reglas en
 * lib/shipping-v2/ajuste-punto8.ts (con pruebas). Ningún artículo cambia de
 * cantidad; solo se corrigen los textos de las novedades y la etiqueta de
 * ACC-000027.
 *
 * USO
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-punto8-novedades.ts            # vista previa
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-punto8-novedades.ts --aplicar   # escribir
 *   (después, la vista previa debe decir 0 cambios)
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { planAjustePunto8Item, planAjustePunto8Novedad, type CambioAjuste8 } from "../lib/shipping-v2/ajuste-punto8";

/** Tope de seguridad: hoy se esperan 60 cambios (59 novedades y ACC-000027). */
const TOPE_CAMBIOS = 65;

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

async function aplicar(url: string, headers: Record<string, string>, cambios: CambioAjuste8[]) {
  let hechos = 0;
  for (let i = 0; i < cambios.length; i += 10) {
    const lote = cambios.slice(i, i + 10);
    const res = await fetch(url, {
      method: "PATCH",
      headers,
      // typecast: crea las opciones nuevas (Asunto interno, Perdido en tienda…).
      body: JSON.stringify({ records: lote.map((c) => ({ id: c.id, fields: c.fields })), typecast: true }),
    });
    if (!res.ok) throw new Error(`Falló un lote (${hechos} ya aplicados): ${res.status} ${await res.text()}`);
    hechos += lote.length;
    await esperar(PAUSA_MS);
  }
  return hechos;
}

async function main() {
  await cargarEnvLocal();
  const token = process.env.AIRTABLE_API_KEY?.trim();
  const baseId = process.env.AIRTABLE_BASE_ID?.trim();
  if (!token || !baseId) throw new Error("Faltan AIRTABLE_API_KEY / AIRTABLE_BASE_ID en .env.local");
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const urlNovedades = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent("Shipping Novedades")}`;
  const urlItems = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent("Shipping Items")}`;
  const ahora = new Date().toISOString();

  const novedades = await listar(urlNovedades, headers, ["Novedad ID", "Tipo de novedad", "Estado Novedad", "Solución", "Decisión sobre el artículo", "Observación final", "Bloquea venta"]);
  const cambiosNovedades: CambioAjuste8[] = [];
  for (const r of novedades) {
    const f = r.fields;
    const cambio = planAjustePunto8Novedad({
      id: r.id,
      novedadId: texto(f["Novedad ID"]),
      tipo: texto(f["Tipo de novedad"]),
      estado: texto(f["Estado Novedad"]),
      solucion: texto(f["Solución"]),
      decision: texto(f["Decisión sobre el artículo"]),
      observacionFinal: texto(f["Observación final"]),
      bloqueaVenta: f["Bloquea venta"] === true,
    }, ahora);
    if (cambio) cambiosNovedades.push(cambio);
  }
  const items = await listar(urlItems, headers, ["SKU", "Estado Item"]);
  // Seguridad: el 10-oct solo ACC-000027 estaba "Con novedad". Si aparece
  // otro, su bloqueo no pasaría a la casilla nueva: se para y se avisa.
  const otrosConNovedad = items.filter((r) => texto(r.fields["Estado Item"]) === "Con novedad" && texto(r.fields["SKU"]) !== "ACC-000027");
  if (otrosConNovedad.length) {
    throw new Error(`Hay artículos "Con novedad" no previstos: ${otrosConNovedad.map((r) => texto(r.fields["SKU"])).join(", ")}. No se aplica nada: revisar con el dueño.`);
  }
  const cambiosItems: CambioAjuste8[] = [];
  for (const r of items) {
    const cambio = planAjustePunto8Item({ id: r.id, sku: texto(r.fields["SKU"]), estado: texto(r.fields["Estado Item"]) }, ahora);
    if (cambio) cambiosItems.push(cambio);
  }

  const total = cambiosNovedades.length + cambiosItems.length;
  console.log(`Novedades leídas: ${novedades.length}. Con cambios: ${cambiosNovedades.length}. Artículos con cambios: ${cambiosItems.length}.`);
  for (const c of [...cambiosNovedades, ...cambiosItems]) console.log(`${c.etiqueta.padEnd(32)} ${c.resumen.join(" · ")}`);
  if (total > TOPE_CAMBIOS) {
    throw new Error(`Se esperaban como mucho ${TOPE_CAMBIOS} cambios y salen ${total}. No se aplica nada: revisar.`);
  }
  if (!APLICAR) {
    console.log("\nVista previa: no se escribió nada. Para aplicar: --aplicar");
    return;
  }
  const hechosN = await aplicar(urlNovedades, headers, cambiosNovedades);
  const hechosI = await aplicar(urlItems, headers, cambiosItems);
  console.log(`\n✅ Aplicados ${hechosN} cambios en novedades y ${hechosI} en artículos. Vuelve a correr la vista previa: debe decir 0.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Ajuste de datos de UNA SOLA VEZ para el punto 9b de la auditoría Shipping V2
 * (pantalla Pagos), aprobado por el dueño el 12-oct-2026. Reglas en
 * lib/shipping-v2/ajuste-punto9b.ts (con pruebas).
 *
 * Qué hace: regalos de Roberto con costo $0 → Regalo; llena "Unidades
 * compradas" en las compras; "Pendiente de pago"/"Pagado" sin llegar →
 * "Registrado"; un Reajuste deja de requerir pago. NO crea pagos.
 *
 * USO
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-punto9b-pagos.ts            # vista previa
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-punto9b-pagos.ts --aplicar   # escribir
 *   (después, la vista previa debe decir 0 cambios)
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { planAjustePunto9b, type CambioAjuste9b } from "../lib/shipping-v2/ajuste-punto9b";

/** Tope de seguridad (12-oct: ~370 compras + 8 regalos + 2 ajustes). */
const TOPE_CAMBIOS = 450;

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
const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

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
  const urlPagos = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent("Shipping Pagos")}`;

  const [items, pagos] = await Promise.all([
    listar(urlItems, headers, [
      "SKU", "Estado Item", "Tipo de operación", "Requiere pago", "Es regalo", "Recibido", "Costo proveedor", "Cantidad",
      "Unidades en packing", "Unidades dadas de baja", "Unidades compradas",
      "Shipping Pagos (Items relacionados)", "Shipping Pagos (Regalos incluidos)",
    ]),
    listar(urlPagos, headers, ["Estado Pago"]),
  ]);
  const estadoPago = new Map(pagos.map((p) => [p.id, texto(p.fields["Estado Pago"])]));

  const cambios: CambioAjuste9b[] = [];
  for (const r of items) {
    const f = r.fields;
    const vinculados = [...ids(f["Shipping Pagos (Items relacionados)"]), ...ids(f["Shipping Pagos (Regalos incluidos)"])];
    const cambio = planAjustePunto9b({
      id: r.id,
      sku: texto(f["SKU"]) || r.id,
      estado: texto(f["Estado Item"]),
      tipoOperacion: texto(f["Tipo de operación"]),
      requierePago: f["Requiere pago"] === true,
      esRegalo: f["Es regalo"] === true,
      recibido: f["Recibido"] === true,
      costoProveedor: numero(f["Costo proveedor"]),
      cantidad: numero(f["Cantidad"]),
      unidadesEnPacking: numero(f["Unidades en packing"]),
      unidadesDadasDeBaja: numero(f["Unidades dadas de baja"]),
      unidadesCompradas: numero(f["Unidades compradas"]),
      pagosVivos: vinculados.filter((id) => (estadoPago.get(id) ?? "desconocido").toLowerCase() !== "anulado").length,
    });
    if (cambio) cambios.push(cambio);
  }

  const especiales = cambios.filter((c) => c.resumen.some((t) => !t.startsWith("compradas = ")) || c.supuesto);
  console.log(`Artículos leídos: ${items.length}. Con cambios: ${cambios.length} (${cambios.length - especiales.length} solo "Unidades compradas").`);
  for (const c of especiales) console.log(`  ${c.sku.padEnd(12)} ${c.resumen.join(" · ")}`);
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

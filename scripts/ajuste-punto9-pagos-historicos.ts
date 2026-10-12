/**
 * Ajuste de datos de UNA SOLA VEZ para el punto 9 de la auditoría Shipping V2
 * (Pagos a proveedor), aprobado por el dueño el 12-oct-2026. Reglas en
 * lib/shipping-v2/ajuste-punto9.ts (con pruebas).
 *
 * Qué hace:
 *   1. Un "pago histórico" por proveedor (Pagado, sin egreso en Finanzas) con
 *      todas las compras registradas antes del corte que no tienen pago.
 *   2. "Pendiente de pago" / "Pagado" → "Registrado" en lo que no ha llegado.
 *   3. Apaga "Requiere pago" en lo que no es una compra.
 *
 * USO
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-punto9-pagos-historicos.ts                       # vista previa
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-punto9-pagos-historicos.ts --aplicar             # escribir
 *   Opcional: --corte=2026-10-14  (fecha de Ecuador; por defecto, ahora). Lo registrado desde el corte NO entra.
 *   (después, la vista previa debe decir 0 cambios y 0 pagos)
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { camposPagoHistorico, planAjustePunto9, type RegistroAjuste9 } from "../lib/shipping-v2/ajuste-punto9";

/** Topes de seguridad (12-oct: se esperan ~7 pagos, ~146 artículos y ~2 cambios de artículo). */
const TOPE_PAGOS = 12;
const TOPE_ARTICULOS_EN_PAGOS = 200;
const TOPE_CAMBIOS_ITEMS = 15;

const APLICAR = process.argv.includes("--aplicar");
const PAUSA_MS = 250;
const REGISTRADO_POR = "Claude (autorizado por el dueño) · ajuste punto 9";

function corteISO(): string {
  const arg = process.argv.find((a) => a.startsWith("--corte="));
  if (!arg) return new Date().toISOString();
  const fecha = arg.slice("--corte=".length);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error("--corte debe ser AAAA-MM-DD");
  return new Date(`${fecha}T00:00:00-05:00`).toISOString(); // medianoche de Ecuador
}

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
  const registros: Array<{ id: string; createdTime?: string; fields: Record<string, unknown> }> = [];
  let offset: string | undefined;
  do {
    const params = new URLSearchParams({ pageSize: "100" });
    for (const campo of campos) params.append("fields[]", campo);
    if (offset) params.set("offset", offset);
    const res = await fetch(`${url}?${params}`, { headers });
    if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { records: Array<{ id: string; createdTime?: string; fields: Record<string, unknown> }>; offset?: string };
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
  const urlProveedores = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent("Shipping Proveedores")}`;
  const corte = corteISO();

  const [items, pagos, proveedores] = await Promise.all([
    listar(urlItems, headers, [
      "SKU", "Estado Item", "Tipo de operación", "Requiere pago", "Es regalo", "Recibido", "Proveedor de compra",
      "Costo proveedor", "Cantidad", "Unidades en packing", "Fecha de registro",
      "Shipping Pagos (Items relacionados)", "Shipping Pagos (Regalos incluidos)",
    ]),
    listar(urlPagos, headers, ["Pago ID", "Estado Pago"]),
    listar(urlProveedores, headers, ["Nombre proveedor"]).catch(() => []),
  ]);
  const estadoPago = new Map(pagos.map((p) => [p.id, texto(p.fields["Estado Pago"])]));
  const nombreProveedor = new Map(proveedores.map((p) => [p.id, texto(p.fields["Nombre proveedor"]) || p.id]));

  const registros: RegistroAjuste9[] = items.map((r) => {
    const f = r.fields;
    const vinculados = [...ids(f["Shipping Pagos (Items relacionados)"]), ...ids(f["Shipping Pagos (Regalos incluidos)"])];
    const proveedorId = ids(f["Proveedor de compra"])[0] ?? "";
    return {
      id: r.id,
      sku: texto(f["SKU"]) || r.id,
      estado: texto(f["Estado Item"]),
      tipoOperacion: texto(f["Tipo de operación"]),
      requierePago: f["Requiere pago"] === true,
      esRegalo: f["Es regalo"] === true,
      recibido: f["Recibido"] === true,
      proveedorId,
      proveedorNombre: nombreProveedor.get(proveedorId) ?? proveedorId,
      costoProveedor: numero(f["Costo proveedor"]),
      cantidad: numero(f["Cantidad"]),
      unidadesEnPacking: numero(f["Unidades en packing"]),
      fechaRegistro: texto(f["Fecha de registro"]) || r.createdTime || "",
      // Un pago que no se pudo leer cuenta como vivo (no se duplica).
      pagosVivos: vinculados.filter((id) => (estadoPago.get(id) ?? "desconocido").toLowerCase() !== "anulado").length,
    };
  });

  const plan = planAjustePunto9(registros, { corteISO: corte });
  const totalArticulos = plan.pagosHistoricos.reduce((n, p) => n + p.itemIds.length, 0);

  console.log(`Corte: ${corte}. Artículos leídos: ${items.length}. Pagos existentes: ${pagos.length}.`);
  console.log(`\nPagos históricos a crear: ${plan.pagosHistoricos.length} (${totalArticulos} artículos)`);
  for (const p of plan.pagosHistoricos) {
    console.log(`  ${p.proveedorNombre.padEnd(28)} ${String(p.itemIds.length).padStart(3)} art. · ~$${p.totalAproximado.toFixed(2)} · ${p.skus.join(" ")}`);
  }
  console.log(`\nCambios en artículos: ${plan.cambiosItems.length}`);
  for (const c of plan.cambiosItems) console.log(`  ${c.sku.padEnd(12)} ${c.resumen.join(" · ")}`);
  if (plan.aRevisar.length) {
    console.log(`\nA revisar a mano: ${plan.aRevisar.length}`);
    for (const r of plan.aRevisar) console.log(`  ${r.sku.padEnd(12)} ${r.motivo}`);
  }

  if (plan.pagosHistoricos.length > TOPE_PAGOS || totalArticulos > TOPE_ARTICULOS_EN_PAGOS || plan.cambiosItems.length > TOPE_CAMBIOS_ITEMS) {
    throw new Error(`Supera los topes (${TOPE_PAGOS} pagos / ${TOPE_ARTICULOS_EN_PAGOS} artículos / ${TOPE_CAMBIOS_ITEMS} cambios). No se aplica nada: revisar.`);
  }
  if (!APLICAR) {
    console.log("\nVista previa: no se escribió nada. Para aplicar: --aplicar");
    return;
  }

  // 1) Artículos
  let hechos = 0;
  for (let i = 0; i < plan.cambiosItems.length; i += 10) {
    const lote = plan.cambiosItems.slice(i, i + 10);
    const res = await fetch(urlItems, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ records: lote.map((c) => ({ id: c.id, fields: c.fields })), typecast: true }),
    });
    if (!res.ok) throw new Error(`Falló el lote de artículos ${i / 10 + 1} (${hechos} ya aplicados): ${res.status} ${await res.text()}`);
    hechos += lote.length;
    await esperar(PAUSA_MS);
  }

  // 2) Pagos históricos (uno por proveedor, uno a la vez)
  const ahora = new Date().toISOString();
  const fecha = ahora.slice(0, 10).replace(/-/g, "");
  let creados = 0;
  for (const [indice, p] of plan.pagosHistoricos.entries()) {
    const pagoId = `PAY-HIST-${fecha}-${String(indice + 1).padStart(2, "0")}`;
    const res = await fetch(urlPagos, {
      method: "POST",
      headers,
      body: JSON.stringify({ records: [{ fields: camposPagoHistorico(p, { pagoId, ahoraISO: ahora, registradoPor: REGISTRADO_POR }) }], typecast: true }),
    });
    if (!res.ok) throw new Error(`Falló el pago de ${p.proveedorNombre} (${creados} pagos ya creados; vuelve a correr: los creados ya no se repiten): ${res.status} ${await res.text()}`);
    creados += 1;
    console.log(`  ✓ ${pagoId} · ${p.proveedorNombre} · ${p.itemIds.length} art.`);
    await esperar(PAUSA_MS);
  }
  console.log(`\n✅ ${hechos} artículos ajustados y ${creados} pagos históricos creados. Vuelve a correr la vista previa: debe decir 0 y 0.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

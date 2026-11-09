/**
 * Ajuste de datos del inventario general 7-nov-2026, aprobado por el dueño el 9-nov-2026.
 *
 *   1. Piezas registradas por error como "Despiece de equipo" (ya vienen de un
 *      despiece): pasan a "Reajuste de inventario" y salen de "Destinado a
 *      partes" a la etiqueta que les toca (Disponible y a la venta, o En revisión
 *      si su categoría pide inspección sin firmar). Regla pura y prueba:
 *      lib/shipping-v2/ajuste-despiece-error.ts.
 *   2. ACC-000038: observación interna "1 de 4 unidades dañada" (conteo 7-nov).
 * Cada cambio deja un evento "Cambio de estado"/"Actualizado" en Shipping Eventos.
 * No cambia cantidades: el Kardex no se toca.
 *
 * USO
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-inventario-7nov-despiece.ts            # vista previa
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-inventario-7nov-despiece.ts --aplicar   # escribir
 *   (después, la vista previa debe decir 0 cambios)
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { planDespieceError } from "../lib/shipping-v2/ajuste-despiece-error";

const APLICAR = process.argv.includes("--aplicar");
const ACTOR = "Ajuste inventario 7-nov (aprobado por el dueño)";
const TOPE_CAMBIOS = 60;
const PAUSA_MS = 250;
const OBS_SKU = "ACC-000038";
const OBS_TEXTO = "Conteo 7-nov-2026: 1 de las 4 unidades está dañada.";

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
const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

async function main() {
  await cargarEnvLocal();
  const token = process.env.AIRTABLE_API_KEY?.trim();
  const baseId = process.env.AIRTABLE_BASE_ID?.trim();
  if (!token || !baseId) throw new Error("Faltan AIRTABLE_API_KEY / AIRTABLE_BASE_ID en .env.local");
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const urlItems = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent("Shipping Items")}`;
  const urlEventos = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent("Shipping Eventos")}`;

  const campos = ["SKU", "Nombre del item", "Tipo de operación", "Estado Item", "Recibido", "Requiere inspección", "Revisado física/técnicamente",
    "Estado de revisión", "Cantidad", "Cantidad Reservada", "Items hijos", "Estado de despiece", "Observaciones internas"];
  const items: Array<{ id: string; fields: Record<string, unknown> }> = [];
  let offset: string | undefined;
  do {
    const params = new URLSearchParams({ pageSize: "100" });
    for (const c of campos) params.append("fields[]", c);
    if (offset) params.set("offset", offset);
    const res = await fetch(`${urlItems}?${params}`, { headers });
    if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { records: typeof items; offset?: string };
    items.push(...data.records);
    offset = data.offset;
    await esperar(PAUSA_MS);
  } while (offset);

  type Cambio = { id: string; sku: string; nombre: string; fields: Record<string, unknown>; estadoAnterior: string; estadoNuevo: string; resumen: string };
  const cambios: Cambio[] = [];
  const revisar: string[] = [];
  for (const r of items) {
    const f = r.fields;
    const plan = planDespieceError({
      id: r.id,
      sku: texto(f["SKU"]) || r.id,
      tipoOperacion: texto(f["Tipo de operación"]),
      estado: texto(f["Estado Item"]),
      recibido: f["Recibido"] === true,
      requiereInspeccion: f["Requiere inspección"] === true,
      inspeccionFirmada: f["Revisado física/técnicamente"] === true,
      estadoRevision: texto(f["Estado de revisión"]),
      cantidad: numero(f["Cantidad"]),
      cantidadReservada: numero(f["Cantidad Reservada"]),
      tieneDespiece: (Array.isArray(f["Items hijos"]) && (f["Items hijos"] as unknown[]).length > 0) || Boolean(texto(f["Estado de despiece"])),
    });
    if (plan.tipo === "cambio") cambios.push({ ...plan, nombre: texto(f["Nombre del item"]) });
    if (plan.tipo === "revisar") revisar.push(`${plan.sku}: ${plan.motivo}`);
  }
  const obs = items.find((r) => texto(r.fields["SKU"]) === OBS_SKU);
  if (!obs) throw new Error(`${OBS_SKU} no existe.`);
  const obsActual = texto(obs.fields["Observaciones internas"]);
  const obsPendiente = !obsActual.includes(OBS_TEXTO);

  console.log(`Artículos leídos: ${items.length}. Piezas a corregir: ${cambios.length}.`);
  for (const c of cambios) console.log(`${c.sku.padEnd(12)} ${c.resumen}`);
  if (revisar.length) {
    console.log(`\n⚠ ${revisar.length} con "Despiece de equipo" que NO se tocan:`);
    for (const s of revisar) console.log(`   · ${s}`);
  }
  console.log(`\n${OBS_SKU}: ${obsPendiente ? `se agrega la observación "${OBS_TEXTO}"` : "la observación ya está"}`);
  if (cambios.length > TOPE_CAMBIOS) throw new Error(`Se esperaban como mucho ${TOPE_CAMBIOS} cambios y salen ${cambios.length}. No se aplica nada: revisar.`);
  if (!APLICAR) {
    console.log("\nVista previa: no se escribió nada. Para aplicar: --aplicar");
    return;
  }

  const ahora = () => new Date().toISOString();
  let hechos = 0;
  for (let i = 0; i < cambios.length; i += 10) {
    const lote = cambios.slice(i, i + 10);
    const res = await fetch(urlItems, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ typecast: true, records: lote.map((c) => ({ id: c.id, fields: { ...c.fields, "Última actualización": ahora(), "Actualizado por": ACTOR } })) }),
    });
    if (!res.ok) throw new Error(`Falló el lote ${i / 10 + 1} (${hechos} ya aplicados): ${res.status} ${await res.text()}`);
    hechos += lote.length;
    await esperar(PAUSA_MS);
    const ev = await fetch(urlEventos, {
      method: "POST",
      headers,
      body: JSON.stringify({
        records: lote.map((c) => ({
          fields: {
            "Tipo de entidad": "Shipping Item",
            "Acción": c.estadoAnterior !== c.estadoNuevo ? "Cambio de estado" : "Actualizado",
            "Item relacionado": [c.id],
            "Estado anterior": c.estadoAnterior,
            "Estado nuevo": c.estadoNuevo,
            "Descripción del evento": `Corrección (inventario 7-nov): se registró por error como "Despiece de equipo"; es una pieza que ya viene de un despiece. Tipo → Reajuste de inventario. ${c.resumen}.`,
            "Registrado por": ACTOR,
            "Fecha del evento": ahora(),
            "Datos relevantes": c.nombre,
          },
        })),
      }),
    });
    if (!ev.ok) console.warn(`No se pudieron registrar los eventos del lote ${i / 10 + 1}: ${ev.status} ${await ev.text()}`);
    await esperar(PAUSA_MS);
  }
  if (obsPendiente) {
    const nueva = obsActual.trim() ? `${obsActual.trim()}\n${OBS_TEXTO}` : OBS_TEXTO;
    const res = await fetch(urlItems, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ records: [{ id: obs.id, fields: { "Observaciones internas": nueva, "Última actualización": ahora(), "Actualizado por": ACTOR } }] }),
    });
    if (!res.ok) throw new Error(`No se pudo escribir la observación de ${OBS_SKU}: ${res.status} ${await res.text()}`);
    await fetch(urlEventos, {
      method: "POST",
      headers,
      body: JSON.stringify({ records: [{ fields: { "Tipo de entidad": "Shipping Item", "Acción": "Actualizado", "Item relacionado": [obs.id], "Descripción del evento": `Observación interna: ${OBS_TEXTO}`, "Registrado por": ACTOR, "Fecha del evento": ahora() } }] }),
    });
  }
  console.log(`\n✅ ${hechos} piezas corregidas${obsPendiente ? ` · observación en ${OBS_SKU}` : ""}. Vuelve a correr la vista previa: debe decir 0.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

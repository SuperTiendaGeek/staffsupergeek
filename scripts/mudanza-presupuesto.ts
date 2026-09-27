/**
 * Mudanza de órdenes viejas al PRESUPUESTO (presupuesto único, fase 3).
 *
 * Por cada cargo que ya existe en una orden (servicio, repuesto de stock,
 * producto digital, artículo de un pedido) y que ninguna línea del presupuesto
 * reclama, crea una línea "Cargada" que APUNTA a ese cargo. Repara además las
 * líneas "Cargada" que nunca guardaron su vínculo (caso OR000486).
 *
 * NO toca dinero ni inventario: no crea, borra ni reserva cargos. El Resumen
 * financiero lee los cargos, así que totales, abonos y documentos quedan igual.
 * Los repuestos del sistema antiguo ("Repuestos por Orden") no se mudan: siguen
 * en el Resumen financiero como "Histórico".
 *
 * Las reglas viven en lib/tecnicos/presupuesto/mudanza.ts (con pruebas). Este
 * script solo lee, llama a planMudanza() y, con --aplicar, escribe.
 *
 * USO
 *   # 1) Vista previa (NO escribe nada). Deja el reporte en .tmp-mudanza/
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/mudanza-presupuesto.ts
 *
 *   # 2) Una sola orden, para probar:
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/mudanza-presupuesto.ts --orden=OR000486
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/mudanza-presupuesto.ts --orden=OR000486 --aplicar
 *
 *   # 3) Todas:
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/mudanza-presupuesto.ts --aplicar
 *
 *   # 4) Verificación: volver a correr la vista previa → debe decir 0 líneas nuevas y 0 vínculos.
 *
 * Se puede correr las veces que haga falta: lo ya mudado no se vuelve a mudar.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { actualizarLinea, crearLineaMudanza, listarTodasLasLineas } from "../lib/tecnicos/presupuesto/airtable";
import {
  APROBADO_POR_MUDANZA, CREADO_POR_MUDANZA, planMudanza, resumirMudanza,
  type CargoDigital, type CargoItem, type CargoPedido, type CargoServicio, type OrdenMudanza, type PlanMudanza,
} from "../lib/tecnicos/presupuesto/mudanza";
import { entradaHistorial, type LineaPresupuesto } from "../lib/tecnicos/presupuesto/reglas";

const APLICAR = process.argv.includes("--aplicar");
const SOLO_ORDEN = process.argv.find((a) => a.startsWith("--orden="))?.split("=")[1]?.trim().toUpperCase() ?? null;
const PAUSA_MS = 220; // Airtable: 5 peticiones por segundo por base.

type Registro = { id: string; fields: Record<string, unknown> };

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
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const texto = (v: unknown): string => (typeof v === "string" ? v : Array.isArray(v) && typeof v[0] === "string" ? v[0] : "");
const numero = (v: unknown): number | null => {
  const x = Array.isArray(v) ? v[0] : v;
  return typeof x === "number" && Number.isFinite(x) ? x : null;
};

/** Lista una tabla completa (paginada, con pausa). Solo lectura. */
async function listar(tabla: string, campos: string[], formula?: string): Promise<Registro[]> {
  const token = process.env.AIRTABLE_API_KEY?.trim();
  const base = process.env.AIRTABLE_BASE_ID?.trim();
  if (!token || !base) throw new Error("Faltan AIRTABLE_API_KEY / AIRTABLE_BASE_ID en .env.local");
  const out: Registro[] = [];
  let offset: string | undefined;
  do {
    const u = new URL(`https://api.airtable.com/v0/${base}/${encodeURIComponent(tabla)}`);
    u.searchParams.set("pageSize", "100");
    for (const c of campos) u.searchParams.append("fields[]", c);
    if (formula) u.searchParams.set("filterByFormula", formula);
    if (offset) u.searchParams.set("offset", offset);
    const res = await fetch(u.toString(), { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Airtable ${tabla} ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { records?: Registro[]; offset?: string };
    out.push(...(data.records ?? []));
    offset = data.offset;
    await esperar(PAUSA_MS);
  } while (offset);
  return out;
}

function agrupar<T>(pares: [string, T][]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const [k, v] of pares) m.set(k, [...(m.get(k) ?? []), v]);
  return m;
}

async function leerOrdenes(): Promise<OrdenMudanza[]> {
  console.log("Leyendo Airtable (solo lectura)…");
  const [ordenes, servicios, items, operaciones, digitales, catalogoDig, legacy, lineas] = [
    await listar("Órdenes de Reparación", ["ID", "Costo Total Servicios NV", "Total Productos Digitales", "Operaciones Comerciales"]),
    await listar("Servicios por Orden", ["Orden de Reparación", "Servicio del Catálogo", "Nombre del servicio snapshot o copiado", "Costo real"]),
    await listar("Shipping Items", ["Nombre del item", "Precio venta final", "Orden de Reparación (Stock)", "Operación Comercial"],
      "OR(LEN(ARRAYJOIN({Orden de Reparación (Stock)}))>0, LEN(ARRAYJOIN({Operación Comercial}))>0)"),
    await listar("Operación Comercial", ["Código Operación", "Orden de Reparación", "Artículo físico"]),
    await listar("Productos Digitales", ["Orden de Reparación", "Software / Producto", "Precio Venta"]),
    await listar("Catálogo Productos Digitales", ["Producto Base"]),
    await listar("Repuestos por Orden", ["Orden de Reparación", "Nombre del repuesto snapshot o copiado", "Subtotal cliente", "Cantidad", "Precio cliente real"]),
    await listarTodasLasLineas(),
  ];
  console.log(`  ${ordenes.length} órdenes · ${servicios.length} servicios · ${items.length} artículos · ${digitales.length} productos digitales · ${legacy.length} repuestos antiguos · ${lineas.length} líneas de presupuesto`);

  const nombreCatalogo = new Map(catalogoDig.map((r) => [r.id, texto(r.fields["Producto Base"])]));
  const itemPorId = new Map(items.map((r) => [r.id, r]));

  const servPorOrden = agrupar<CargoServicio>(servicios.flatMap((r) => ids(r.fields["Orden de Reparación"]).map((o): [string, CargoServicio] => [o, {
    id: r.id,
    catalogoId: ids(r.fields["Servicio del Catálogo"])[0] ?? null,
    nombre: texto(r.fields["Nombre del servicio snapshot o copiado"]) || "Servicio",
    costo: numero(r.fields["Costo real"]) ?? 0,
  }])));
  const stockPorOrden = agrupar<CargoItem>(items.flatMap((r) => ids(r.fields["Orden de Reparación (Stock)"]).map((o): [string, CargoItem] => [o, {
    id: r.id, nombre: texto(r.fields["Nombre del item"]) || "Repuesto", precio: numero(r.fields["Precio venta final"]) ?? 0,
  }])));
  const digPorOrden = agrupar<CargoDigital>(digitales.flatMap((r) => ids(r.fields["Orden de Reparación"]).map((o): [string, CargoDigital] => {
    const cat = ids(r.fields["Software / Producto"])[0] ?? null;
    return [o, { id: r.id, catalogoId: cat, nombre: (cat && nombreCatalogo.get(cat)) || "", precio: numero(r.fields["Precio Venta"]) ?? 0 }];
  })));
  const pedPorOrden = agrupar<CargoPedido>(operaciones.flatMap((r) => {
    const articulos = ids(r.fields["Artículo físico"]);
    if (articulos.length === 0) return []; // sin artículo todavía: no es un cargo
    const primero = itemPorId.get(articulos[0]);
    return ids(r.fields["Orden de Reparación"]).map((o): [string, CargoPedido] => [o, {
      operacionId: r.id,
      codigo: texto(r.fields["Código Operación"]) || r.id,
      itemIds: articulos,
      nombre: primero ? texto(primero.fields["Nombre del item"]) || "Repuesto bajo pedido" : "Repuesto bajo pedido",
      precio: primero ? numero(primero.fields["Precio venta final"]) ?? 0 : 0,
    }]);
  }));
  const legPorOrden = agrupar(legacy.flatMap((r) => ids(r.fields["Orden de Reparación"]).map((o): [string, { nombre: string; subtotal: number }] => {
    const cant = numero(r.fields["Cantidad"]); const precio = numero(r.fields["Precio cliente real"]);
    return [o, { nombre: texto(r.fields["Nombre del repuesto snapshot o copiado"]) || "Repuesto", subtotal: numero(r.fields["Subtotal cliente"]) ?? (cant != null && precio != null ? cant * precio : precio ?? 0) }];
  })));
  const linPorOrden = agrupar<LineaPresupuesto>(lineas.filter((l) => l.ordenId).map((l): [string, LineaPresupuesto] => [l.ordenId!, l]));

  return ordenes
    .map((r): OrdenMudanza => ({
      ordenId: r.id,
      idVisible: texto(r.fields["ID"]) || r.id,
      servicios: servPorOrden.get(r.id) ?? [],
      itemsStock: stockPorOrden.get(r.id) ?? [],
      digitales: digPorOrden.get(r.id) ?? [],
      pedidos: pedPorOrden.get(r.id) ?? [],
      historicos: legPorOrden.get(r.id) ?? [],
      rollups: { servicios: numero(r.fields["Costo Total Servicios NV"]) ?? 0, digitales: numero(r.fields["Total Productos Digitales"]) ?? 0 },
      lineas: linPorOrden.get(r.id) ?? [],
    }))
    .filter((o) => o.servicios.length || o.itemsStock.length || o.digitales.length || o.pedidos.length || o.historicos.length || o.lineas.length)
    .filter((o) => !SOLO_ORDEN || o.idVisible.toUpperCase() === SOLO_ORDEN);
}

function reporte(planes: PlanMudanza[]): string {
  const r = resumirMudanza(planes);
  const mon = (n: number) => `$${n.toFixed(2)}`;
  const partes = [
    `# Mudanza al presupuesto — ${APLICAR ? "APLICADA" : "vista previa (no se escribió nada)"}`,
    "",
    `- Órdenes revisadas: **${r.ordenes}**`,
    `- Con algo que mudar: **${r.conCambios}** → **${r.lineasNuevas}** líneas nuevas y **${r.vinculos}** vínculos reparados`,
    `- Bloqueadas (no se tocan): **${r.bloqueadas}**`,
    `- Con avisos para revisar a mano: **${r.conAvisos}**`,
    "",
  ];
  const ordenadas = [...planes].sort((a, b) => a.idVisible.localeCompare(b.idVisible));
  for (const p of ordenadas) {
    if (!p.bloqueada && !p.crear.length && !p.vincular.length && !p.avisos.length && !p.resumen.historicos) continue;
    partes.push(`## ${p.idVisible}${p.bloqueada ? " — BLOQUEADA" : ""}`);
    if (p.bloqueada) partes.push(`- ⛔ ${p.bloqueada}`);
    for (const c of p.crear) partes.push(`- ➕ ${c.tipo}${c.operacionId ? " (bajo pedido)" : ""}: ${c.descripcion} — ${mon(c.precioUnitario)}`);
    for (const v of p.vincular) partes.push(`- 🔗 Vincular "${v.descripcion}" a su cargo (${v.cargoId})`);
    for (const a of p.avisos) partes.push(`- ⚠️ ${a}`);
    if (p.resumen.historicos) partes.push(`- 📜 ${p.resumen.historicos} repuesto(s) del sistema antiguo (${mon(p.resumen.totalHistoricos)}) siguen en el Resumen financiero como "Histórico".`);
    partes.push("");
  }
  return partes.join("\n");
}

async function aplicar(planes: PlanMudanza[]): Promise<{ ok: number; errores: string[] }> {
  let ok = 0;
  const errores: string[] = [];
  for (const p of planes) {
    if (p.bloqueada || (!p.crear.length && !p.vincular.length)) continue;
    try {
      for (const v of p.vincular) {
        const agregarHistorial = { anterior: v.historialAnterior, entrada: entradaHistorial("Mudanza: se vinculó la línea a su cargo en la orden.", CREADO_POR_MUDANZA) };
        if (v.campo === "cargoServicioId") await actualizarLinea(v.lineaId, { cargoServicioId: v.cargoId, agregarHistorial });
        else if (v.campo === "cargoProductoDigitalId") await actualizarLinea(v.lineaId, { cargoProductoDigitalId: v.cargoId, agregarHistorial });
        else await actualizarLinea(v.lineaId, { itemId: v.cargoId, agregarHistorial });
        await esperar(PAUSA_MS);
      }
      for (const c of p.crear) {
        await crearLineaMudanza(p.ordenId, c, {
          creadoPor: CREADO_POR_MUDANZA,
          aprobadoPor: APROBADO_POR_MUDANZA,
          historial: entradaHistorial("Mudanza: el cargo ya estaba en la orden antes del presupuesto; se registra aquí sin tocarlo.", CREADO_POR_MUDANZA),
        });
        await esperar(PAUSA_MS);
      }
      ok++;
      console.log(`  ✓ ${p.idVisible}: ${p.crear.length} línea(s), ${p.vincular.length} vínculo(s)`);
    } catch (e) {
      const msg = `${p.idVisible}: ${e instanceof Error ? e.message : String(e)}`;
      errores.push(msg);
      console.error(`  ✗ ${msg}`);
    }
  }
  return { ok, errores };
}

async function main() {
  await cargarEnvLocal();
  const ordenes = await leerOrdenes();
  if (SOLO_ORDEN && ordenes.length === 0) throw new Error(`No se encontró la orden ${SOLO_ORDEN} (o no tiene cargos ni líneas).`);
  const planes = ordenes.map(planMudanza);

  const carpeta = path.join(process.cwd(), ".tmp-mudanza");
  await mkdir(carpeta, { recursive: true });
  const sello = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const nombre = `${APLICAR ? "aplicada" : "vista-previa"}-${SOLO_ORDEN ?? "todas"}-${sello}`;
  await writeFile(path.join(carpeta, `${nombre}.md`), reporte(planes));
  await writeFile(path.join(carpeta, `${nombre}.json`), JSON.stringify(planes, null, 2));
  console.log(reporte(planes).split("\n").slice(0, 8).join("\n"));
  console.log(`\nReporte completo: .tmp-mudanza/${nombre}.md`);

  if (!APLICAR) {
    console.log("\nVista previa: no se escribió nada. Para aplicar, agrega --aplicar.");
    return;
  }
  console.log("\nAplicando…");
  const r = await aplicar(planes);
  console.log(`\nListo: ${r.ok} orden(es) mudada(s), ${r.errores.length} con error.`);
  if (r.errores.length) {
    console.log("Las órdenes con error quedaron a medias o sin tocar; volver a correr el script las completa sin duplicar.");
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

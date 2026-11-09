/**
 * Inventario general del 7-nov-2026 (conteo físico de toda la tienda, aprobado
 * por el dueño el 9-nov-2026). Carga el sheet "CONTEO 7 NOV SUPER GEEK" como un
 * Conteo del portal y aplica los ajustes con el MISMO mecanismo de
 * Shipping V2 → Control → Conteo (aplicarConteoShippingV2): cada baja o
 * "encontrada" queda en el Kardex con su motivo y se puede revertir.
 *
 * Datos (fuera de git): private/inventario-2026-11-07/conteo-final.json
 *   lecturas          SKU → unidades contadas (sheet + correcciones del dueño)
 *   lecturaUnidad     SKU → record ID (unidad vendida que apareció en la tienda)
 *   seguimientoLote   registros de accesorios/cables con 1 unidad y sin
 *                     "Seguimiento": se marcan "Lote" (lo que ya dice su
 *                     categoría) para que el conteo los compare por cantidad
 *   decisionesFalta   SKU → baja-perdido | baja-error | fuera
 *   usoLocal          activos que pasan a uso local después del cuadre
 *
 * USO
 *   NODE_OPTIONS="--conditions react-server" NODE_USE_ENV_PROXY=1 npx tsx scripts/inventario-general-2026-11-07.ts            # vista previa
 *   NODE_OPTIONS="--conditions react-server" NODE_USE_ENV_PROXY=1 npx tsx scripts/inventario-general-2026-11-07.ts --aplicar
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// El entorno donde corre corta cada ejecución a ~3 minutos, así que se aplica por etapas:
//   --preparar  Seguimiento=Lote, crea el conteo, carga las lecturas y lo termina.
//   --bajas     da de baja los faltantes (por tandas: repetir hasta que diga 0 pendientes).
//               Mismo motivo y Kardex que aplicarConteoShippingV2. Lo ya hecho queda
//               como "cambió" en la comparación y no se repite.
//   --cerrar    aplica con aplicarConteoShippingV2 lo que queda (encontradas y "está
//               fuera"), deja el conteo "Aplicado" y pasa los activos a uso local.
const MODO = process.argv.includes("--preparar") ? "preparar" : process.argv.includes("--bajas") ? "bajas" : process.argv.includes("--cerrar") ? "cerrar" : "vista";
const APLICAR = MODO !== "vista";
const PRESUPUESTO_MS = 140_000;
const INICIO = Date.now();
const ACTOR = "Inventario 7-nov (aprobado por el dueño)";
const NOMBRE = "Inventario general 7 nov";
const DIR = path.join(process.cwd(), "private/inventario-2026-11-07");

type Datos = {
  lecturas: Record<string, number>;
  lecturaUnidad: Record<string, string>;
  seguimientoLote: string[];
  decisionesFalta: Record<string, "baja-perdido" | "baja-error" | "fuera">;
  usoLocal: Array<{ id: string; sku: string; cantidad: number }>;
};

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
const log: string[] = [];
const decir = (t: string) => { console.log(t); log.push(t); };

async function main() {
  await cargarEnvLocal();
  const token = process.env.AIRTABLE_API_KEY?.trim();
  const baseId = process.env.AIRTABLE_BASE_ID?.trim();
  if (!token || !baseId) throw new Error("Faltan AIRTABLE_API_KEY / AIRTABLE_BASE_ID");
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const url = (t: string) => `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(t)}`;
  async function escribir(tabla: string, method: "POST" | "PATCH", records: unknown[]) {
    for (let i = 0; i < records.length; i += 10) {
      const res = await fetch(url(tabla), { method, headers, body: JSON.stringify({ records: records.slice(i, i + 10) }) });
      if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text()}`);
      await esperar(250);
    }
  }

  const A = await import("../lib/shipping-v2/airtable");
  const C = await import("../lib/shipping-v2/conteo");
  const { systemShippingV2Access } = await import("../lib/shipping-v2/access");
  const access = { ...systemShippingV2Access(), isSiteAdmin: true };
  const datos = JSON.parse(await readFile(path.join(DIR, "conteo-final.json"), "utf8")) as Datos;

  // 1. Lo que hay hoy, con el arreglo de Seguimiento ya aplicado (en memoria si es vista previa).
  const lote = new Set(datos.seguimientoLote);
  let items = await A.getShippingV2ItemsParaConteo();
  items = items.map((i) => (lote.has(i.id) ? { ...i, seguimiento: "Lote" } : i));
  const alcance = { categorias: [] as string[], incluyeActivos: true };
  const porSku = new Map<string, typeof items>();
  for (const i of items) porSku.set(i.sku.toUpperCase(), [...(porSku.get(i.sku.toUpperCase()) ?? []), i]);

  // 2. Lecturas.
  type L = { codigo: string; itemId?: string; sku: string; cantidad: number; tipo: "Lote" | "Sin identificar" | "Unidad" };
  const lecturas: L[] = [];
  for (const [sku, cantidad] of Object.entries(datos.lecturas)) {
    const regs = porSku.get(sku);
    if (!regs?.length) throw new Error(`${sku} no existe en el sistema.`);
    if (datos.lecturaUnidad[sku]) { lecturas.push({ codigo: sku, sku, itemId: datos.lecturaUnidad[sku], cantidad, tipo: "Unidad" }); continue; }
    const esLote = regs.some((i) => !C.esUnidad(i));
    lecturas.push({ codigo: sku, sku, cantidad, tipo: esLote ? "Lote" : "Sin identificar" });
  }

  // 3. Comparar (igual que el portal) y armar las decisiones.
  const ahora = new Date().toISOString();
  const lineas = lecturas.map((l, k) => ({ id: `sim${k}`, codigo: l.codigo, itemId: l.itemId, sku: l.sku, serie: "", cantidad: l.cantidad, tipo: l.tipo, contadoPor: ACTOR, fecha: ahora, anulada: false }));
  const resultado = C.compararConteo({ items, lineas, alcance, inicio: ahora, foto: C.fotoInicial(items, alcance) });
  const decisiones: Array<{ sku: string; lado: "falta" | "sobra"; accion: import("../lib/shipping-v2/conteo").AccionAjuste }> = [];
  const sinDecision: string[] = [];
  for (const f of resultado.faltan) {
    const a = datos.decisionesFalta[f.sku];
    if (!a) sinDecision.push(`falta ${f.sku}`); else decisiones.push({ sku: f.sku, lado: "falta", accion: a });
  }
  for (const f of resultado.sobran) decisiones.push({ sku: f.sku, lado: "sobra", accion: "encontrada" });
  const esperadas = new Set(Object.keys(datos.decisionesFalta));
  for (const f of resultado.faltan) esperadas.delete(f.sku);
  for (const s of esperadas) sinDecision.push(`decisión sin faltante ${s}`);
  const plan = C.planAjustes(resultado, decisiones);
  const errores = plan.filter((p) => p.error);

  decir(`Artículos: ${items.length} · lecturas: ${lecturas.length} · coinciden ${resultado.coinciden.length} · faltan ${resultado.faltan.length} · sobran ${resultado.sobran.length} · sin registro ${resultado.sinRegistro.length}`);
  const porAccion = new Map<string, { n: number; u: number; v: number }>();
  for (const p of plan) {
    const k = p.texto; const x = porAccion.get(k) ?? { n: 0, u: 0, v: 0 };
    x.n++; x.u += p.operaciones.reduce((s, o) => s + o.cantidad, 0); x.v += p.valor; porAccion.set(k, x);
  }
  for (const [k, x] of porAccion) decir(`  ${k}: ${x.n} SKU · ${x.u} u. · $${x.v.toFixed(2)}`);
  for (const p of plan) decir(`    ${p.lado} ${p.sku.padEnd(11)} ${p.texto} · ${p.operaciones.map((o) => `${o.accion} ${o.cantidad}`).join(", ") || "sin cambio"}${p.error ? ` · ERROR ${p.error}` : ""}`);
  decir(`Pasan a uso local: ${datos.usoLocal.map((u) => `${u.sku} ×${u.cantidad}`).join(", ")}`);
  if ((MODO === "vista" || MODO === "preparar") && (sinDecision.length || errores.length)) {
    decir(`NO SE APLICA NADA. Sin decisión: ${sinDecision.join("; ") || "—"} · Errores: ${errores.map((e) => `${e.sku} ${e.error}`).join("; ") || "—"}`);
    await writeFile(path.join(DIR, "salida.txt"), log.join("\n"));
    process.exitCode = 1;
    return;
  }
  if (MODO === "vista") {
    decir("\nVista previa: no se escribió nada. Etapas: --preparar, --bajas (repetir), --cerrar");
    await writeFile(path.join(DIR, "salida.txt"), log.join("\n"));
    return;
  }
  await escribirModo(MODO);
  async function escribirModo(modo: string) {
    if (modo === "preparar") {
      const yaId = await readFile(path.join(DIR, "conteo-id.txt"), "utf8").catch(() => "");
      if (yaId.trim()) throw new Error(`Ya existe el conteo ${yaId.trim()}: no se prepara otro.`);
      if (lote.size) {
        await escribir("Shipping Items", "PATCH", [...lote].map((id) => ({ id, fields: { Seguimiento: "Lote" } })));
        decir(`Seguimiento = Lote en ${lote.size} registros.`);
      }
      const conteo = await A.crearConteoShippingV2({ nombre: NOMBRE, categorias: [], incluyeActivos: true }, { actor: ACTOR });
      await writeFile(path.join(DIR, "conteo-id.txt"), conteo.id);
      decir(`Conteo creado: ${conteo.id}`);
      const fecha = new Date().toISOString();
      await escribir("Shipping Conteo líneas", "POST", lecturas.map((l) => ({
        fields: {
          "Código leído": l.codigo, Conteo: [conteo.id], "Conteo ID": conteo.id, "Artículo": l.itemId ? [l.itemId] : [],
          SKU: l.sku, Serie: "", Cantidad: l.cantidad, Tipo: l.tipo, "Contado por": ACTOR, Fecha: fecha,
        },
      })));
      decir(`Lecturas cargadas: ${lecturas.length}`);
      await A.cambiarEstadoConteoShippingV2(conteo.id, { accion: "terminar" }, { actor: ACTOR, esAdministrador: true });
      decir("Conteo terminado.");
      return;
    }
    const conteoId = (await readFile(path.join(DIR, "conteo-id.txt"), "utf8")).trim();
    const { conteo, resultado: real } = await A.revisarConteoShippingV2(conteoId);
    if (conteo.estado !== "Terminado") throw new Error(`El conteo está "${conteo.estado}".`);
    if (modo === "bajas") {
      const { causaDeBaja } = await import("../lib/shipping-v2/kardex");
      const faltas = real.faltan.filter((f) => datos.decisionesFalta[f.sku] && datos.decisionesFalta[f.sku] !== "fuera");
      const planB = C.planAjustes(real, faltas.map((f) => ({ sku: f.sku, lado: "falta" as const, accion: datos.decisionesFalta[f.sku] })));
      let hechos = 0;
      for (const p of planB) {
        if (Date.now() - INICIO > PRESUPUESTO_MS) break;
        if (p.error) { decir(`  ERROR ${p.sku}: ${p.error}`); continue; }
        const motivo = `Conteo "${conteo.nombre}": ${C.MOTIVO_AJUSTE[p.accion].toLowerCase()}`;
        const kardex = { causa: causaDeBaja(C.MOTIVO_AJUSTE[p.accion]), contexto: { documentoTipo: "Conteo" as const, documentoId: conteo.id, documento: `Conteo ${conteo.nombre}` } };
        try {
          for (const op of p.operaciones) await A.moverActivoShippingV2(op.itemId, { accion: "baja", cantidad: op.cantidad, motivo, kardex }, { actor: ACTOR, access });
          hechos++;
          decir(`  baja ${p.sku} · ${p.operaciones.reduce((s, o) => s + o.cantidad, 0)} u. · ${C.MOTIVO_AJUSTE[p.accion]}`);
        } catch (e) { decir(`  ERROR ${p.sku}: ${e instanceof Error ? e.message : e}`); }
      }
      decir(`Tanda: ${hechos} SKU dados de baja · pendientes ${planB.length - hechos}`);
      return;
    }
    // cerrar
    const pendientes = real.faltan.filter((f) => datos.decisionesFalta[f.sku] && datos.decisionesFalta[f.sku] !== "fuera");
    if (pendientes.length) throw new Error(`Quedan ${pendientes.length} bajas: corre --bajas primero.`);
    const finales = [
      ...real.faltan.map((f) => ({ sku: f.sku, lado: "falta" as const, accion: datos.decisionesFalta[f.sku] })),
      ...real.sobran.map((f) => ({ sku: f.sku, lado: "sobra" as const, accion: "encontrada" as const })),
    ].filter((d) => d.accion);
    const r = await A.aplicarConteoShippingV2(conteo.id, finales, { actor: ACTOR, access });
    const malos = r.resultados.filter((x) => !x.ok);
    decir(`Cierre: ${r.resultados.length - malos.length} bien · ${malos.length} con error · conteo ${r.conteo.estado}`);
    for (const m of malos) decir(`  ERROR ${m.lado} ${m.sku}: ${m.texto}`);
    for (const u of datos.usoLocal) {
      try {
        await A.moverActivoShippingV2(u.id, { accion: "uso-local", cantidad: u.cantidad, motivo: `${NOMBRE}: es un activo de la tienda (nota del conteo)` }, { actor: ACTOR, access });
        decir(`Uso local: ${u.sku} ×${u.cantidad}`);
      } catch (e) { decir(`  ERROR uso local ${u.sku}: ${e instanceof Error ? e.message : e}`); }
    }
  }
  decir("Listo.");
  await writeFile(path.join(DIR, `salida-${MODO}.txt`), log.join("\n"), { flag: "a" });
}

main().catch(async (e) => { decir(`FALLÓ: ${e instanceof Error ? e.stack : e}`); await writeFile(path.join(DIR, `salida-${MODO}.txt`), log.join("\n")); process.exit(1); });

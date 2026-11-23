/**
 * Rediseño de la orden, parte R7 · 23-nov-2026 — motivos de ingreso con chips:
 *   1. Crea el catálogo inicial (27 motivos en 4 grupos, con sus palabras
 *      parecidas) en la tabla «Motivos de ingreso». No repite los que ya existen.
 *   2. Lee el «Ingresa Por» de cada orden vieja y le pone sus motivos (chips).
 *      Solo órdenes que todavía no tienen motivos.
 * No borra ni cambia «Ingresa Por»: queda como «lo que dijo el cliente».
 * Reglas puras y pruebas: lib/tecnicos/motivos/{semilla,migracion}.ts.
 *
 * USO
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/rediseno-r7-motivos.ts            # vista previa (+ CSV en Descargas)
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/rediseno-r7-motivos.ts --aplicar   # escribir
 *   (después, la vista previa debe decir 0 acciones)
 */

import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const APLICAR = process.argv.includes("--aplicar");
const CSV = path.join(os.homedir(), "Downloads", "r7-motivos-vista-previa.csv");

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
const lotes = <T,>(xs: T[], n = 10): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const csv = (v: string) => `"${String(v ?? "").replace(/"/g, '""').replace(/\n/g, " ⏎ ")}"`;

async function main(): Promise<void> {
  await cargarEnvLocal();
  const { listarTodo, ids, texto } = await import("../lib/estado-cuenta/airtable");
  const { airtableMutation, tableUrl } = await import("../lib/finanzas/airtable-client");
  const { TABLA_MOTIVOS, M, CAMPO_MOTIVOS_ORDEN } = await import("../lib/tecnicos/motivos/servidor");
  const { planMigracionMotivos, accionesPendientes, idsPorNombre } = await import("../lib/tecnicos/motivos/migracion");

  const T_ORDENES = "Órdenes de Reparación";
  const [motivosRaw, ordenesRaw] = await Promise.all([
    listarTodo(TABLA_MOTIVOS, [M.nombre]),
    listarTodo(T_ORDENES, ["ID", "Ingresa Por", CAMPO_MOTIVOS_ORDEN]),
  ]);
  const existentes = motivosRaw.map((r) => ({ id: r.id, nombre: texto(r.fields[M.nombre]) })).filter((m) => m.nombre);
  const ordenes = ordenesRaw.map((r) => ({
    id: r.id,
    codigo: texto(r.fields["ID"]) || r.id,
    ingresaPor: texto(r.fields["Ingresa Por"]),
    motivoIds: ids(r.fields[CAMPO_MOTIVOS_ORDEN]),
  }));
  const plan = planMigracionMotivos({ existentes, ordenes });

  // Resumen
  const uso = new Map<string, number>();
  for (const l of plan.ligar) for (const n of l.nombres) uso.set(n, (uso.get(n) ?? 0) + 1);
  console.log(`Órdenes: ${ordenes.length} · ya tenían motivos: ${plan.yaTenian}`);
  console.log(`Motivos a crear: ${plan.crear.length} (ya existen ${existentes.length})`);
  console.log(`Órdenes a ligar: ${plan.ligar.length} · sin motivo (texto vacío o sin coincidencia): ${plan.sinMotivo.length}`);
  for (const [n, c] of [...uso].sort((a, b) => b[1] - a[1])) console.log(`  ${String(c).padStart(4)}  ${n}`);
  const conTexto = plan.sinMotivo.filter((s) => s.ingresaPor.trim() && s.ingresaPor.trim() !== ".");
  if (conTexto.length) {
    console.log("Sin motivo pero con texto (quedan para elegir a mano en la orden):");
    for (const s of conTexto) console.log(`  ${s.codigo}  ${s.ingresaPor.replace(/\n/g, " ").slice(0, 100)}`);
  }

  const filas = [
    "Código,Ingresa Por,Motivos propuestos",
    ...plan.ligar.map((l) => [l.codigo, l.ingresaPor, l.nombres.join(" · ")].map(csv).join(",")),
    ...plan.sinMotivo.map((s) => [s.codigo, s.ingresaPor, "(sin motivo)"].map(csv).join(",")),
  ];
  await writeFile(CSV, filas.join("\n"), "utf8");
  console.log(`\nVista previa: ${CSV}`);
  console.log(`Acciones pendientes: ${accionesPendientes(plan)}`);

  if (!APLICAR) { console.log("\n(Vista previa: no se escribió nada. Para escribir: --aplicar)"); return; }

  // 1) Catálogo
  const creados: Array<{ id: string; nombre: string }> = [];
  for (const lote of lotes(plan.crear)) {
    const r = await airtableMutation<{ records: Array<{ id: string; fields: Record<string, unknown> }> }>(tableUrl(TABLA_MOTIVOS), {
      method: "POST",
      body: JSON.stringify({
        records: lote.map((m) => ({ fields: {
          [M.nombre]: m.nombre, [M.grupo]: m.grupo, [M.palabras]: m.palabras.join("\n"),
          [M.activo]: true, [M.nuevo]: false, [M.creadoPor]: "Catálogo inicial (R7)",
        } })),
        typecast: true,
      }),
    });
    creados.push(...r.records.map((x) => ({ id: x.id, nombre: texto(x.fields[M.nombre]) })));
    await esperar(250);
  }
  console.log(`Motivos creados: ${creados.length}`);

  // 2) Órdenes
  const todos = [...existentes, ...creados];
  let ligadas = 0;
  for (const lote of lotes(plan.ligar)) {
    await airtableMutation(tableUrl(T_ORDENES), {
      method: "PATCH",
      body: JSON.stringify({ records: lote.map((l) => ({ id: l.ordenId, fields: { [CAMPO_MOTIVOS_ORDEN]: idsPorNombre(l.nombres, todos) } })) }),
    });
    ligadas += lote.length;
    await esperar(250);
  }
  console.log(`Órdenes ligadas: ${ligadas}`);
  console.log("Listo. Corre de nuevo la vista previa: debe decir 0 acciones pendientes.");
}

main().catch((e) => { console.error(e); process.exit(1); });

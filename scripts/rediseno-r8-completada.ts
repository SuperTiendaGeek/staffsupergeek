/**
 * Rediseño de la orden, parte R8 · 24-nov-2026 — política de baja unificada.
 * Llena «Completada el» en las órdenes que YA estaban en «Completado» (solo si
 * está vacío). Desde R8 el portal lo escribe solo al pasar a Completado.
 * Fecha: «Estado cambiado el» (Airtable sabe cuándo cambió el estado) o, si no
 * hubiera, «Cliente avisado». Después muestra qué órdenes quedan «Para baja».
 * Reglas puras y pruebas: lib/tecnicos/orden/baja.ts.
 *
 * USO
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/rediseno-r8-completada.ts            # vista previa (+ CSV en Descargas)
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/rediseno-r8-completada.ts --aplicar   # escribir
 *   (después, la vista previa debe decir 0 acciones)
 */

import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const APLICAR = process.argv.includes("--aplicar");
const CSV = path.join(os.homedir(), "Downloads", "r8-completada-vista-previa.csv");

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
const csv = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const dia = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

async function main(): Promise<void> {
  await cargarEnvLocal();
  const { listarTodo, texto } = await import("../lib/estado-cuenta/airtable");
  const { airtableMutation, tableUrl } = await import("../lib/finanzas/airtable-client");
  const { planCompletadaEl, evaluarBaja, ETIQUETA_BAJA } = await import("../lib/tecnicos/orden/baja");

  const T_ORDENES = "Órdenes de Reparación";
  const CAMPOS = ["ID", "Estado Actual", "Fecha de Ingreso", "Completada el", "Estado cambiado el", "Cliente avisado"];
  const FORMULA = "AND({Estado Actual} != 'Finalizado Entregado', {Estado Actual} != 'Enviado a Reciclaje')";

  const fecha = (f: Record<string, unknown>, k: string) => texto(f[k]) || null;
  const ordenes = (await listarTodo(T_ORDENES, CAMPOS, FORMULA)).map((r) => ({
    id: r.id,
    codigo: texto(r.fields["ID"]) || r.id,
    estado: texto(r.fields["Estado Actual"]) || "Pendiente",
    fechaIngreso: texto(r.fields["Fecha de Ingreso"]) || r.createdTime || "",
    completadaEl: fecha(r.fields, "Completada el"),
    estadoCambiadoEl: fecha(r.fields, "Estado cambiado el"),
    clienteAvisado: fecha(r.fields, "Cliente avisado"),
  }));

  const plan = planCompletadaEl(ordenes);
  console.log(`Órdenes abiertas: ${ordenes.length} · completadas: ${ordenes.filter((o) => o.estado === "Completado").length}`);
  console.log(`Acciones: ${plan.length} órdenes · «Completada el» vacío`);
  for (const a of plan) console.log(`  ${a.codigo.padEnd(9)} Completada el ${dia(a.fecha)} (${a.de})`);

  // Cómo queda la política de baja con las fechas nuevas.
  const ahora = new Date();
  const conFecha = ordenes.map((o) => ({ ...o, completadaEl: o.completadaEl ?? plan.find((a) => a.ordenId === o.id)?.fecha ?? null }));
  const bajas = conFecha.map((o) => ({ o, b: evaluarBaja(o, ahora) })).filter((x) => x.b);
  console.log(`\nPara baja después: ${bajas.length}`);
  for (const { o, b } of bajas) console.log(`  ${o.codigo.padEnd(9)} ${o.estado.padEnd(20)} ${b ? `${ETIQUETA_BAJA[b.nivel]} · ${b.dias} d desde ${b.desde === "ingreso" ? "el ingreso" : "que se completó"}` : ""}`);

  await writeFile(CSV, [
    "Código,Estado,Completada el (nuevo),De dónde,Política de baja,Días,Cuenta desde",
    ...conFecha.map((o) => {
      const a = plan.find((x) => x.ordenId === o.id);
      const b = evaluarBaja(o, ahora);
      return [o.codigo, o.estado, a ? dia(a.fecha) : o.completadaEl ? `(ya tenía) ${dia(o.completadaEl)}` : "", a?.de ?? "",
        b ? ETIQUETA_BAJA[b.nivel] : "", b ? String(b.dias) : "", b ? (b.desde === "ingreso" ? "Ingreso" : "Completada") : ""].map(csv).join(",");
    }),
  ].join("\n"), "utf8");
  console.log(`CSV: ${CSV}`);

  if (!APLICAR) {
    console.log("\nVista previa: no se escribió nada. Para escribir: --aplicar");
    return;
  }
  let hechas = 0;
  for (const grupo of lotes(plan)) {
    await airtableMutation(tableUrl(T_ORDENES), {
      method: "PATCH",
      body: JSON.stringify({ records: grupo.map((a) => ({ id: a.ordenId, fields: { "Completada el": a.fecha } })) }),
    });
    hechas += grupo.length;
    await esperar(250);
  }
  console.log(`\nListo: ${hechas} órdenes actualizadas. Corre otra vez sin --aplicar: debe decir 0 acciones.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Ajuste de datos — auditoría Técnicos y Operaciones, punto 11B · 21-nov-2026.
 *
 * Las 8 notas que ya había en la tabla «Manual Técnico» reciben su Tipo
 * (4 Procedimiento · 2 Regla de la tienda · 2 Nota) y Estado «Verificada».
 * No cambia su texto ni borra nada. Regla pura y prueba:
 * lib/manual-tecnico/tipos-iniciales.ts.
 *
 * USO
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-auditoria-ops-punto11b.ts            # vista previa
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-auditoria-ops-punto11b.ts --aplicar   # escribir
 *   (después, la vista previa debe decir 0 acciones)
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

const APLICAR = process.argv.includes("--aplicar");

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

const txt = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "name" in v) return String((v as { name: unknown }).name ?? "");
  return "";
};

async function main(): Promise<void> {
  await cargarEnvLocal();
  const { planTiposIniciales, QUIEN_AJUSTA } = await import("../lib/manual-tecnico/tipos-iniciales");
  const { CAMPOS_MANUAL: C, TABLA_MANUAL } = await import("../lib/manual-tecnico/reglas");
  const { listarTodo } = await import("../lib/estado-cuenta/airtable");
  const { airtableMutation, tableUrl } = await import("../lib/finanzas/airtable-client");

  const registros = await listarTodo(TABLA_MANUAL, [C.cod, C.notas, C.claves, C.tipo, C.estado]);
  const plan = planTiposIniciales(registros.map((r) => ({
    id: r.id,
    cod: typeof r.fields[C.cod] === "number" ? (r.fields[C.cod] as number) : null,
    notas: txt(r.fields[C.notas]),
    claves: txt(r.fields[C.claves]),
    tipo: txt(r.fields[C.tipo]),
    estado: txt(r.fields[C.estado]),
  })));

  console.log(`\nManual Técnico: ${registros.length} registros leídos.`);
  console.log(`Acciones: ${plan.acciones.length}${APLICAR ? "" : " (vista previa, no se escribe nada)"}\n`);
  for (const a of plan.acciones) console.log(`  Cod ${a.cod} → ${a.tipo} · ${a.estado}   «${a.resumen}»`);
  for (const s of plan.saltadas) console.log(`  [saltada] Cod ${s.cod}: ${s.motivo}`);

  if (!APLICAR || !plan.acciones.length) {
    if (!APLICAR && plan.acciones.length) console.log("\nPara escribir: agrega --aplicar");
    return;
  }
  const ahora = new Date().toISOString();
  for (let i = 0; i < plan.acciones.length; i += 10) {
    const lote = plan.acciones.slice(i, i + 10);
    await airtableMutation(tableUrl(TABLA_MANUAL), {
      method: "PATCH",
      body: JSON.stringify({
        typecast: true,
        records: lote.map((a) => ({
          id: a.id,
          fields: { [C.tipo]: a.tipo, [C.estado]: a.estado, [C.verificadoPor]: QUIEN_AJUSTA, [C.fechaVerificacion]: ahora },
        })),
      }),
    });
  }
  console.log(`\nListo: ${plan.acciones.length} notas con su tipo. Corre de nuevo la vista previa: debe decir 0 acciones.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

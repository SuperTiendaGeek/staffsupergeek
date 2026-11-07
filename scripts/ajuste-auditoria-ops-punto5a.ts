/**
 * Ajuste de datos — auditoría Técnicos y Operaciones, punto 5A (7-nov-2026).
 * 13 unidades de "Usuario/Contraseña" tienen en "Clave de activación" lo que
 * autocompletó el navegador ("Elfina.8990"). Se vacía ese campo y se quita el
 * PDF guardado (llevaba esa clave): el próximo "Generar PDF" sale limpio.
 * Usuario y contraseña NO se tocan. Regla en lib/productos-digitales/ajuste-5a.ts.
 *
 * USO
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-auditoria-ops-punto5a.ts            # vista previa
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-auditoria-ops-punto5a.ts --aplicar   # escribir
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

type Registro = { id: string; fields: Record<string, unknown> };

async function main(): Promise<void> {
  await cargarEnvLocal();
  const { planLimpiezaClave, VALOR_AUTOCOMPLETADO } = await import("../lib/productos-digitales/ajuste-5a");
  const { nombreLimpio } = await import("../lib/productos-digitales/reglas");
  const { airtableRequest, airtableMutation, tableUrl } = await import("../lib/finanzas/airtable-client");

  const u = new URL(tableUrl("Productos Digitales"));
  u.searchParams.set("pageSize", "100");
  u.searchParams.set("filterByFormula", `FIND('${VALOR_AUTOCOMPLETADO}', {Clave de Activación})`);
  const registros: Registro[] = [];
  let offset: string | undefined;
  do {
    if (offset) u.searchParams.set("offset", offset);
    const r = await airtableRequest<{ records?: Registro[]; offset?: string }>(u.toString());
    registros.push(...(r.records ?? []));
    offset = r.offset;
  } while (offset);

  const primero = (v: unknown) => (Array.isArray(v) ? String(v[0] ?? "") : typeof v === "string" ? v : "");
  const plan = planLimpiezaClave(registros.map((r) => ({
    id: r.id,
    sku: primero(r.fields["SKU"]) || r.id,
    producto: nombreLimpio(primero(r.fields["Producto Digital"])),
    tipo: primero(r.fields["Tipo Producto"]) || null,
    clave: typeof r.fields["Clave de Activación"] === "string" ? (r.fields["Clave de Activación"] as string) : null,
    tienePdf: Array.isArray(r.fields["Documento PDF"]) && (r.fields["Documento PDF"] as unknown[]).length > 0,
  })));

  console.log(`\n=== Ajuste punto 5A (clave autocompletada) — ${APLICAR ? "APLICAR" : "VISTA PREVIA"} ===\n`);
  console.log(`${plan.length} acción(es):`);
  plan.forEach((a, i) => console.log(`  ${i + 1}. ${a.sku} · ${a.producto}: vaciar "Clave de activación"${a.quitarPdf ? " y quitar el PDF guardado" : ""}`));
  if (!APLICAR || plan.length === 0) {
    if (!APLICAR && plan.length) console.log("\n(Vista previa: no se escribió nada. Corre con --aplicar cuando el dueño lo apruebe.)");
    return;
  }
  for (const a of plan) {
    const fields: Record<string, unknown> = { "Clave de Activación": "" };
    if (a.quitarPdf) Object.assign(fields, { "Documento PDF": [], "Documento generado por": null, "Fecha último PDF": null });
    await airtableMutation(tableUrl("Productos Digitales"), { method: "PATCH", body: JSON.stringify({ records: [{ id: a.id, fields }] }) });
    console.log(`✓ ${a.sku}`);
  }
  console.log("\n✅ Listo. Vuelve a correr la vista previa: debe decir 0 acciones.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

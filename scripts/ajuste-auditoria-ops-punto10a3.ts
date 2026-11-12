/**
 * Ajuste de datos — auditoría Técnicos y Operaciones, punto 10A-3 (12-nov-2026).
 * Pasa los pedidos ABIERTOS del Operaciones viejo (Requerimiento / Cotizado /
 * Aprobado / Pedido, sin orden) al pedido especial nuevo. Las Opciones viejas
 * no se borran. Nada mueve dinero: la cuenta de cada pedido se compara antes y
 * después y debe quedar igual.
 * Regla pura y prueba: lib/pedidos-especiales/migrar-abiertos.ts.
 *
 * USO
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-auditoria-ops-punto10a3.ts            # vista previa
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-auditoria-ops-punto10a3.ts --aplicar   # escribir
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

const txt = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return txt(v[0]);
  return v && typeof v === "object" && "name" in v ? String((v as { name: unknown }).name ?? "") : "";
};
const links = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const numN = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && v !== null && v !== "" && v !== undefined ? n : null;
};

async function main(): Promise<void> {
  await cargarEnvLocal();
  const { planMigracionAbiertos, USUARIO_MIGRACION } = await import("../lib/pedidos-especiales/migrar-abiertos");
  const { airtableRequest, airtableMutation, fetchRecordsByIds, tableUrl } = await import("../lib/finanzas/airtable-client");
  const { estadosDeCuentaDeOperaciones } = await import("../lib/estado-cuenta/airtable");
  const { entradaHistorial } = await import("../lib/compras/reglas");

  const u = new URL(tableUrl("Operación Comercial"));
  u.searchParams.set("pageSize", "100");
  u.searchParams.set("filterByFormula",
    "AND({Orden de Reparación}='', OR({Estado}='Requerimiento', {Estado}='Cotizado', {Estado}='Aprobado', {Estado}='Pedido'))");
  const ops: Registro[] = [];
  let offset: string | undefined;
  do {
    if (offset) u.searchParams.set("offset", offset);
    const r = await airtableRequest<{ records?: Registro[]; offset?: string }>(u.toString());
    ops.push(...(r.records ?? []));
    offset = r.offset;
  } while (offset);

  const opciones = await fetchRecordsByIds("Opciones", ops.flatMap((o) => links(o.fields["Opciones"])));

  const { acciones, avisos } = planMigracionAbiertos({
    operaciones: ops.map((o) => ({
      id: o.id,
      codigo: txt(o.fields["Código Operación"]) || o.id,
      estado: txt(o.fields["Estado"]),
      ordenId: links(o.fields["Orden de Reparación"])[0] ?? null,
      categoria: txt(o.fields["Categoría"]),
      lineaIds: links(o.fields["Líneas del pedido"]),
      opcionIds: links(o.fields["Opciones"]),
      opcionElegidaId: links(o.fields["Opción Elegida"])[0] ?? null,
      itemIds: links(o.fields["Artículo físico"]),
      abonado: numN(o.fields["Total Abonado"]) ?? 0,
    })),
    opciones: opciones.map((x) => ({
      id: x.id,
      texto: txt(x.fields["Producto / Descripción"]),
      cantidad: numN(x.fields["Cantidad"]),
      precioUnitario: numN(x.fields["Precio unitario cliente"]),
      precioVenta: numN(x.fields["Precio Venta Cliente"]),
      costo: numN(x.fields["Costo Proveedor"]),
      url: txt(x.fields["URL Proveedor"]),
      tiempo: txt(x.fields["Tiempo Estimado"]),
      nota: txt(x.fields["Nota para Cliente"]),
      proveedorId: links(x.fields["Proveedor"])[0] ?? null,
      itemIds: links(x.fields["Artículo Asociado"]),
    })),
  });

  const pedidoIds = [...new Set(acciones.map((a) => (a.tipo === "crear_linea" ? a.linea.pedidoId : a.pedidoId)))];
  const antes = await estadosDeCuentaDeOperaciones(pedidoIds);
  const codigo = new Map(ops.map((o) => [o.id, txt(o.fields["Código Operación"]) || o.id]));

  console.log(`\n=== Ajuste punto 10A-3 (pedidos abiertos → pedido nuevo) — ${APLICAR ? "APLICAR" : "VISTA PREVIA"} ===\n`);
  for (const id of pedidoIds) {
    const lista = acciones.filter((a) => (a.tipo === "crear_linea" ? a.linea.pedidoId : a.pedidoId) === id);
    console.log(`${codigo.get(id)} (${txt(ops.find((o) => o.id === id)?.fields["Estado"])})`);
    for (const a of lista) {
      if (a.tipo === "crear_linea") console.log(`  · línea ${a.linea.estado}: ${a.linea.descripcion.slice(0, 70)} ×${a.linea.cantidad} a $${a.linea.precioUnitario}${a.linea.itemId ? " (con su artículo)" : ""}`);
      if (a.tipo === "estado") console.log(`  · pasa a "${a.estado}"`);
    }
    const c = antes.get(id);
    console.log(`  · cuenta: total $${c?.totalCuenta ?? 0} · pagado $${c?.totalAbonado ?? 0}`);
  }
  if (avisos.length) {
    console.log(`\nAvisos (${avisos.length}):`);
    avisos.forEach((x) => console.log(`  · ${x.op}: ${x.texto}`));
  }
  console.log(`\n${acciones.length} acción(es) en ${pedidoIds.length} pedido(s).`);
  if (!APLICAR || acciones.length === 0) {
    if (!APLICAR && acciones.length) console.log("\n(Vista previa: no se escribió nada. Corre con --aplicar cuando el dueño lo apruebe.)");
    return;
  }

  const ahora = new Date();
  for (const a of acciones) {
    if (a.tipo !== "crear_linea") continue;
    const l = a.linea;
    const aceptada = l.estado !== "Propuesta";
    const fields: Record<string, unknown> = {
      Pedido: [l.pedidoId],
      Tipo: "Repuesto",
      "Descripción": l.descripcion,
      Cantidad: l.cantidad,
      "Precio unitario": l.precioUnitario,
      Estado: l.estado,
      "Creado por": USUARIO_MIGRACION,
      Prioridad: "Recomendada",
      "Bajo pedido": true,
      "Grupo de alternativas": l.grupo,
      Historial: entradaHistorial(`Pasó desde la opción vieja del pedido ${l.op} (punto 10A-3).`, USUARIO_MIGRACION, ahora),
    };
    if (l.proveedorId) fields["Proveedor"] = [l.proveedorId];
    if (l.categoria) fields["Categoría"] = l.categoria;
    if (l.costo != null) fields["Costo proveedor"] = l.costo;
    if (l.url) fields["URL proveedor"] = l.url;
    if (l.tiempo) fields["Tiempo estimado"] = l.tiempo;
    if (l.notaCliente) fields["Nota para el cliente"] = l.notaCliente;
    if (l.itemId) fields["Artículo de inventario"] = [l.itemId];
    if (aceptada) { fields["Aprobado por"] = USUARIO_MIGRACION; fields["Fecha de aprobación"] = ahora.toISOString(); }
    await airtableMutation(tableUrl("Presupuesto por Orden"), { method: "POST", body: JSON.stringify({ records: [{ fields }], typecast: true }) });
    console.log(`✓ ${l.op}: ${l.descripcion.slice(0, 50)}`);
  }
  for (const a of acciones) {
    if (a.tipo !== "estado") continue;
    const op = ops.find((o) => o.id === a.pedidoId);
    const obs = txt(op?.fields["Observación Interna"]).trim();
    const fields: Record<string, unknown> = {
      Estado: a.estado,
      "Observación Interna": [obs, entradaHistorial(a.observacion, USUARIO_MIGRACION, ahora)].filter(Boolean).join("\n"),
    };
    if (a.estado === "Aceptado") { fields["Aceptado por"] = USUARIO_MIGRACION; fields["Aceptado vía"] = "En tienda"; }
    await airtableMutation(tableUrl("Operación Comercial"), { method: "PATCH", body: JSON.stringify({ records: [{ id: a.pedidoId, fields }], typecast: true }) });
    console.log(`✓ ${a.op} → ${a.estado}`);
  }

  const despues = await estadosDeCuentaDeOperaciones(pedidoIds);
  console.log("\nCuenta de cada pedido, antes → después:");
  let distintas = 0;
  for (const id of pedidoIds) {
    const x = antes.get(id), y = despues.get(id);
    const igual = (x?.totalCuenta ?? 0) === (y?.totalCuenta ?? 0) && (x?.totalAbonado ?? 0) === (y?.totalAbonado ?? 0);
    if (!igual) distintas++;
    console.log(`  ${igual ? "=" : "≠"} ${codigo.get(id)}: total $${x?.totalCuenta ?? 0} → $${y?.totalCuenta ?? 0} · pagado $${x?.totalAbonado ?? 0} → $${y?.totalAbonado ?? 0}`);
  }
  console.log(distintas ? `\n⚠ ${distintas} cuenta(s) cambiaron: revisar.` : "\nTodas las cuentas quedaron igual.");
}

main().catch((e) => { console.error(e); process.exit(1); });

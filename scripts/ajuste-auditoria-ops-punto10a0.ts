/**
 * Ajuste de datos — auditoría Técnicos y Operaciones, punto 10A-0 (10-nov-2026).
 * Termina de separar las órdenes de reparación de Operaciones Comerciales: las
 * operaciones del flujo viejo que siguen enganchadas a una orden pasan a la
 * orden (abonos, artículo, línea y solicitud) y se cierran con una nota.
 * La cuenta de cada orden NO cambia: se compara antes y después.
 * Regla pura y prueba: lib/operaciones/separar-de-ordenes.ts.
 *
 * USO
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-auditoria-ops-punto10a0.ts            # vista previa
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-auditoria-ops-punto10a0.ts --aplicar   # escribir
 *   (después, la vista previa debe decir 0 acciones)
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

const APLICAR = process.argv.includes("--aplicar");
const USUARIO = "Ajuste auditoría 10A-0";

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
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v) || 0);

async function main(): Promise<void> {
  await cargarEnvLocal();
  const { planSeparacion, mismasCifras } = await import("../lib/operaciones/separar-de-ordenes");
  const { airtableRequest, airtableMutation, fetchRecordsByIds, tableUrl } = await import("../lib/finanzas/airtable-client");
  const { estadosDeCuentaDeOrdenes } = await import("../lib/estado-cuenta/airtable");
  const { entradaHistorial } = await import("../lib/compras/reglas");

  // Operaciones abiertas enganchadas a una orden.
  const u = new URL(tableUrl("Operación Comercial"));
  u.searchParams.set("pageSize", "100");
  u.searchParams.set("filterByFormula", "AND({Orden de Reparación}!='', {Estado}!='Entregado', {Estado}!='Rechazado', {Estado}!='Cancelado')");
  const ops: Registro[] = [];
  let offset: string | undefined;
  do {
    if (offset) u.searchParams.set("offset", offset);
    const r = await airtableRequest<{ records?: Registro[]; offset?: string }>(u.toString());
    ops.push(...(r.records ?? []));
    offset = r.offset;
  } while (offset);

  const ordenIds = [...new Set(ops.flatMap((o) => links(o.fields["Orden de Reparación"])))];
  const [ordenes, lineas, items, abonos, solicitudes] = await Promise.all([
    fetchRecordsByIds("Órdenes de Reparación", ordenIds),
    fetchRecordsByIds("Presupuesto por Orden", ops.flatMap((o) => links(o.fields["Presupuesto por Orden"]))),
    fetchRecordsByIds("Shipping Items", ops.flatMap((o) => links(o.fields["Artículo físico"]))),
    fetchRecordsByIds("Abonos", ops.flatMap((o) => links(o.fields["Abonos"]))),
    fetchRecordsByIds("Solicitudes de Compra", ops.flatMap((o) => links(o.fields["Solicitudes de Compra"]))),
  ]);
  const codigoOrden = new Map(ordenes.map((o) => [o.id, txt(o.fields["ID"]) || o.id]));

  const { acciones, bloqueos } = planSeparacion({
    operaciones: ops.map((o) => ({
      id: o.id,
      codigo: txt(o.fields["Código Operación"]) || o.id,
      estado: txt(o.fields["Estado"]),
      ordenId: links(o.fields["Orden de Reparación"])[0] ?? null,
      ordenCodigo: codigoOrden.get(links(o.fields["Orden de Reparación"])[0] ?? "") ?? "",
      itemIds: links(o.fields["Artículo físico"]),
      lineaIds: links(o.fields["Presupuesto por Orden"]),
      abonoIds: links(o.fields["Abonos"]),
      solicitudIds: links(o.fields["Solicitudes de Compra"]),
      documentos: links(o.fields["Recibos"]).length + links(o.fields["Facturas Electrónicas"]).length,
      observacion: txt(o.fields["Observación Interna"]),
    })),
    lineas: lineas.map((l) => ({
      id: l.id,
      ordenId: links(l.fields["Orden de Reparación"])[0] ?? null,
      operacionId: links(l.fields["Operación Comercial"])[0] ?? null,
      itemId: links(l.fields["Artículo de inventario"])[0] ?? null,
      estado: txt(l.fields["Estado"]),
    })),
    items: items.map((i) => ({
      id: i.id,
      sku: txt(i.fields["SKU"]) || i.id,
      operacionIds: links(i.fields["Operación Comercial"]),
      ordenStockIds: links(i.fields["Orden de Reparación (Stock)"]),
    })),
    abonos: abonos.map((a) => ({
      id: a.id,
      numero: txt(a.fields["ID Abono"]) || a.id,
      monto: num(a.fields["Monto"]),
      ordenIds: links(a.fields["Aplicado a: Orden"]),
      operacionIds: links(a.fields["Aplicado a: Operación"]),
    })),
    solicitudes: solicitudes.map((s) => ({
      id: s.id,
      codigo: txt(s.fields["Código"]) || s.id,
      operacionId: links(s.fields["Operación"])[0] ?? null,
      ordenId: links(s.fields["Orden"])[0] ?? null,
      lineaId: links(s.fields["Línea de presupuesto"])[0] ?? null,
    })),
  });

  // Cuenta de cada orden ANTES (debe quedar igual).
  const afectadas = [...new Set(ops.filter((o) => acciones.some((a) => a.tipo === "cerrar_op" && a.id === o.id)).flatMap((o) => links(o.fields["Orden de Reparación"])))];
  const leerCuentas = async () => estadosDeCuentaDeOrdenes(await fetchRecordsByIds("Órdenes de Reparación", afectadas));
  const antes = await leerCuentas();

  console.log(`\n=== Ajuste punto 10A-0 (separar órdenes de Operaciones) — ${APLICAR ? "APLICAR" : "VISTA PREVIA"} ===\n`);
  const porOp = new Map<string, typeof acciones>();
  for (const a of acciones) porOp.set(a.op, [...(porOp.get(a.op) ?? []), a]);
  for (const [op, lista] of porOp) {
    const cierre = lista.find((a) => a.tipo === "cerrar_op");
    console.log(`${op} → ${cierre && cierre.tipo === "cerrar_op" ? cierre.orden : "?"}`);
    for (const a of lista) {
      if (a.tipo === "abono_solo_orden") console.log(`  · abono ${a.numero} ($${a.monto}): queda solo en la orden`);
      if (a.tipo === "item_a_orden") console.log(`  · ${a.sku}: apartado para la orden (deja la operación)`);
      if (a.tipo === "linea_sin_op") console.log(`  · línea del presupuesto: deja de apuntar a la operación (sigue Cargada)`);
      if (a.tipo === "solicitud_a_orden") console.log(`  · ${a.codigo}: pasa a la orden y a su línea`);
      if (a.tipo === "cerrar_op") console.log(`  · la operación se cierra ("Cancelado") con la nota y sale del tablero`);
    }
  }
  if (bloqueos.length) {
    console.log(`\nBloqueadas (no se tocan) (${bloqueos.length}):`);
    bloqueos.forEach((b) => console.log(`  · ${b.op}: ${b.motivo}`));
  }
  console.log("\nCuenta de cada orden (debe quedar igual):");
  for (const id of afectadas) {
    const c = antes.get(id);
    console.log(`  · ${codigoOrden.get(id)}: total $${c?.totalCuenta ?? "?"} · pagado $${c?.totalAbonado ?? "?"} · saldo $${c?.saldo ?? "?"}`);
  }
  console.log(`\n${acciones.length} acción(es) en ${porOp.size} operación(es).`);
  if (!APLICAR || acciones.length === 0) {
    if (!APLICAR && acciones.length) console.log("\n(Vista previa: no se escribió nada. Corre con --aplicar cuando el dueño lo apruebe.)");
    return;
  }

  const patch = (tabla: string, id: string, fields: Record<string, unknown>) =>
    airtableMutation(tableUrl(tabla), { method: "PATCH", body: JSON.stringify({ records: [{ id, fields }], typecast: true }) });
  const historialSol = new Map(solicitudes.map((s) => [s.id, txt(s.fields["Historial"])]));
  const skuPorItem = new Map(items.map((i) => [i.id, txt(i.fields["SKU"])]));

  for (const a of acciones.filter((x) => x.tipo === "abono_solo_orden")) {
    if (a.tipo !== "abono_solo_orden") continue;
    await patch("Abonos", a.id, { "Aplicado a: Operación": a.operacionIds });
    console.log(`✓ abono ${a.numero}`);
  }
  for (const a of acciones) {
    if (a.tipo !== "item_a_orden") continue;
    await patch("Shipping Items", a.id, { "Operación Comercial": a.operacionIds, "Orden de Reparación (Stock)": a.ordenStockIds });
    await airtableMutation(tableUrl("Shipping Eventos"), {
      method: "POST",
      body: JSON.stringify({ records: [{ fields: {
        "Tipo de entidad": "Shipping Item", "Acción": "Actualizado", "Item relacionado": [a.id],
        "Descripción del evento": `Apartado directamente para la orden ${codigoOrden.get(a.ordenId)} (antes colgaba de ${a.op}). Separación orden/pedidos, punto 10A-0.`,
        "Registrado por": USUARIO, "Fecha del evento": new Date().toISOString(), "Datos relevantes": skuPorItem.get(a.id) ?? "",
      } }], typecast: true }),
    });
    console.log(`✓ ${a.sku}`);
  }
  for (const a of acciones) {
    if (a.tipo !== "linea_sin_op") continue;
    await patch("Presupuesto por Orden", a.id, { "Operación Comercial": [] });
    console.log(`✓ línea de ${a.op}`);
  }
  for (const a of acciones) {
    if (a.tipo !== "solicitud_a_orden") continue;
    const anterior = historialSol.get(a.id) ?? "";
    await patch("Solicitudes de Compra", a.id, {
      Orden: [a.ordenId], "Línea de presupuesto": [a.lineaId], "Operación": [], "Opción": [], Clave: `linea:${a.lineaId}`,
      Historial: [anterior.trim(), entradaHistorial(`Pasó a la orden ${codigoOrden.get(a.ordenId)} (antes ${a.op}). Separación orden/pedidos.`, USUARIO)].filter(Boolean).join("\n"),
    });
    console.log(`✓ ${a.codigo}`);
  }
  for (const a of acciones) {
    if (a.tipo !== "cerrar_op") continue;
    await patch("Operación Comercial", a.id, { Estado: "Cancelado", "Orden de Reparación": [], "Observación Interna": a.observacion });
    console.log(`✓ ${a.op} cerrada`);
  }

  const despues = await leerCuentas();
  console.log("\nCuenta de cada orden, antes → después:");
  let distintas = 0;
  for (const id of afectadas) {
    const x = antes.get(id), y = despues.get(id);
    const ok = !!x && !!y && mismasCifras(x, y);
    if (!ok) distintas++;
    console.log(`  ${ok ? "✓" : "✗"} ${codigoOrden.get(id)}: total $${x?.totalCuenta} → $${y?.totalCuenta} · pagado $${x?.totalAbonado} → $${y?.totalAbonado} · saldo $${x?.saldo} → $${y?.saldo}`);
  }
  if (distintas) {
    console.error(`\n⚠️  ${distintas} orden(es) cambiaron de cifras. NO sigas: pásale esta salida a Claude.`);
    process.exit(1);
  }
  console.log("\n✅ Listo. Vuelve a correr la vista previa: debe decir 0 acciones.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

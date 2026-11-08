/**
 * Ajuste de datos — auditoría Técnicos y Operaciones, punto 5C (con el 14) · 8-nov-2026.
 *
 *   1. Une "Microsoft Office 365 Education" dentro de "Microsoft 365 Education
 *      (PC, Mac)": mueve sus licencias y sus líneas de presupuesto y BORRA el
 *      catálogo duplicado (decisión del dueño), solo si ya no le queda nada.
 *   2. "Producto Digital" guarda solo el nombre del catálogo (sin estado ni
 *      fecha): corrige "#ERROR!" (DIG-000059) y "Disponible" (DIG-000080).
 *   3. Licencia sin "Fecha de Compra" → la fecha en que se registró.
 *   4. DIG-000082 (prueba) → "Anulado".
 *   5. Línea digital aprobada antes de la 5B-2 sin solicitud (OR000535) → nace
 *      su solicitud "Por comprar" por el camino normal (aprobarYCargar).
 * Regla pura y prueba: lib/productos-digitales/ajuste-5c.ts.
 *
 * USO
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-auditoria-ops-punto5c.ts            # vista previa
 *   NODE_OPTIONS="--conditions react-server" npx tsx scripts/ajuste-auditoria-ops-punto5c.ts --aplicar   # escribir
 *   (después, la vista previa debe decir 0 acciones)
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

const APLICAR = process.argv.includes("--aplicar");
const USUARIO = "Ajuste auditoría 5C";

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

type Registro = { id: string; createdTime?: string; fields: Record<string, unknown> };

const T_UNIDADES = "Productos Digitales";
const T_CATALOGO = "Catálogo Productos Digitales";
const T_LINEAS = "Presupuesto por Orden";
const T_ORDENES = "Órdenes de Reparación";
const CAMPO_CATALOGO_LINEA = "Producto digital del catálogo";

const txt = (v: unknown): string => (typeof v === "string" ? v : Array.isArray(v) ? String(v[0] ?? "") : "");
const links = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

async function main(): Promise<void> {
  await cargarEnvLocal();
  const { planAjuste5C, puedeBorrarCatalogo, CATALOGO_DESTINO, CATALOGO_DUPLICADO } = await import("../lib/productos-digitales/ajuste-5c");
  const { airtableRequest, airtableMutation, fetchRecordsByIds, tableUrl } = await import("../lib/finanzas/airtable-client");
  const { listarTodasLasLineas } = await import("../lib/tecnicos/presupuesto/airtable");
  const { aprobarYCargar } = await import("../lib/tecnicos/presupuesto/cargar");
  const { hoyEcuador } = await import("../lib/saldo-favor/servidor");

  async function todos(tabla: string, campos: string[]): Promise<Registro[]> {
    const out: Registro[] = [];
    let offset: string | undefined;
    do {
      const u = new URL(tableUrl(tabla));
      u.searchParams.set("pageSize", "100");
      for (const c of campos) u.searchParams.append("fields[]", c);
      if (offset) u.searchParams.set("offset", offset);
      const r = await airtableRequest<{ records?: Registro[]; offset?: string }>(u.toString());
      out.push(...(r.records ?? []));
      offset = r.offset;
    } while (offset);
    return out;
  }

  const [catalogoRaw, unidadesRaw, lineasTodas] = await Promise.all([
    todos(T_CATALOGO, ["Producto Base"]),
    todos(T_UNIDADES, ["SKU", "Producto Digital", "Software / Producto", "Estado", "Fecha de Compra", "Observaciones Internas"]),
    listarTodasLasLineas(),
  ]);
  const lineasDigitales = lineasTodas.filter((l) => l.tipo === "Producto digital");
  const ordenes = await fetchRecordsByIds(T_ORDENES, lineasDigitales.map((l) => l.ordenId).filter((x): x is string => !!x));
  const codigoOrden = new Map(ordenes.map((o) => [o.id, txt(o.fields?.["ID"]) || o.id]));

  const { acciones, omitidos } = planAjuste5C({
    catalogo: catalogoRaw.map((c) => ({ id: c.id, nombre: txt(c.fields["Producto Base"]) })),
    unidades: unidadesRaw.map((u) => ({
      id: u.id,
      sku: txt(u.fields["SKU"]) || u.id,
      catalogoId: links(u.fields["Software / Producto"])[0] ?? null,
      nombreActual: txt(u.fields["Producto Digital"]),
      estado: u.fields["Estado"] && typeof u.fields["Estado"] === "object" ? String((u.fields["Estado"] as { name?: string }).name ?? "") : txt(u.fields["Estado"]),
      fechaCompra: txt(u.fields["Fecha de Compra"]) || null,
      fechaRegistro: hoyEcuador(new Date(u.createdTime ?? Date.now())),
      observaciones: txt(u.fields["Observaciones Internas"]),
    })),
    lineas: lineasDigitales.map((l) => ({
      id: l.id,
      orden: (l.ordenId && codigoOrden.get(l.ordenId)) || "(sin orden)",
      ordenId: l.ordenId,
      descripcion: l.descripcion,
      tipo: l.tipo,
      estado: l.estado,
      catalogoId: l.productoCatalogoId,
      solicitudId: l.solicitudId ?? null,
      cargoProductoDigitalId: l.cargoProductoDigitalId,
    })),
  });

  console.log(`\n=== Ajuste punto 5C (productos digitales) — ${APLICAR ? "APLICAR" : "VISTA PREVIA"} ===\n`);
  const grupos: Array<[string, string]> = [
    ["mover_unidad", "Licencias que pasan al catálogo que queda"],
    ["mover_linea", "Líneas de presupuesto que pasan al catálogo que queda"],
    ["nombre", "Nombre limpio (solo el del catálogo)"],
    ["fecha_compra", "Fecha de compra vacía → fecha de registro"],
    ["anular_prueba", "Registro de prueba → Anulado"],
    ["crear_solicitud", "Solicitud de compra que falta"],
    ["borrar_catalogo", "Catálogo duplicado que se borra"],
  ];
  for (const [tipo, titulo] of grupos) {
    const del = acciones.filter((a) => a.tipo === tipo);
    if (!del.length) continue;
    console.log(`${titulo} (${del.length}):`);
    for (const a of del) {
      if (a.tipo === "mover_unidad") console.log(`  · ${a.sku}: "${a.desde}" → "${a.hacia}"`);
      else if (a.tipo === "mover_linea") console.log(`  · ${a.orden}: "${a.desde}" → "${a.hacia}"`);
      else if (a.tipo === "nombre") console.log(`  · ${a.sku}: "${a.antes}" → "${a.despues}"`);
      else if (a.tipo === "fecha_compra") console.log(`  · ${a.sku}: ${a.fecha}`);
      else if (a.tipo === "anular_prueba") console.log(`  · ${a.sku}`);
      else if (a.tipo === "crear_solicitud") console.log(`  · ${a.orden}: ${a.descripcion} → "Por comprar"`);
      else if (a.tipo === "borrar_catalogo") console.log(`  · "${a.nombre}" (${a.id})`);
    }
    console.log("");
  }
  if (omitidos.length) {
    console.log(`No se tocan (${omitidos.length}):`);
    omitidos.forEach((o) => console.log(`  · ${o.que}: ${o.motivo}`));
    console.log("");
  }
  console.log(`${acciones.length} acción(es).`);
  if (!APLICAR || acciones.length === 0) {
    if (!APLICAR && acciones.length) console.log("\n(Vista previa: no se escribió nada. Corre con --aplicar cuando el dueño lo apruebe.)");
    return;
  }

  // ── Escribir: unidades (campos juntos por registro, de a 10) ───────────────
  const porUnidad = new Map<string, Record<string, unknown>>();
  const sku = new Map<string, string>();
  for (const a of acciones) {
    if (a.tipo !== "mover_unidad" && a.tipo !== "nombre" && a.tipo !== "fecha_compra" && a.tipo !== "anular_prueba") continue;
    const f = porUnidad.get(a.id) ?? {};
    sku.set(a.id, a.sku);
    if (a.tipo === "mover_unidad") f["Software / Producto"] = [CATALOGO_DESTINO];
    if (a.tipo === "nombre") f["Producto Digital"] = a.despues;
    if (a.tipo === "fecha_compra") f["Fecha de Compra"] = a.fecha;
    if (a.tipo === "anular_prueba") Object.assign(f, { Estado: "Anulado", "Observaciones Internas": a.observaciones });
    porUnidad.set(a.id, f);
  }
  const lotes = [...porUnidad.entries()];
  for (let i = 0; i < lotes.length; i += 10) {
    const lote = lotes.slice(i, i + 10);
    await airtableMutation(tableUrl(T_UNIDADES), { method: "PATCH", body: JSON.stringify({ records: lote.map(([id, fields]) => ({ id, fields })) }) });
    console.log(`✓ licencias ${lote.map(([id]) => sku.get(id)).join(", ")}`);
    await new Promise((r) => setTimeout(r, 220));
  }

  // ── Líneas de presupuesto ──────────────────────────────────────────────────
  for (const a of acciones) {
    if (a.tipo !== "mover_linea") continue;
    await airtableMutation(tableUrl(T_LINEAS), { method: "PATCH", body: JSON.stringify({ records: [{ id: a.id, fields: { [CAMPO_CATALOGO_LINEA]: [CATALOGO_DESTINO] } }] }) });
    console.log(`✓ línea de ${a.orden}`);
  }

  // ── Solicitudes que faltan: el camino normal de aprobar ───────────────────
  for (const a of acciones) {
    if (a.tipo !== "crear_solicitud") continue;
    const r = await aprobarYCargar({ ordenId: a.ordenId, lineaIds: [a.lineaId], usuario: { nombre: USUARIO } });
    const paso = r.find((x) => x.lineaId === a.lineaId);
    if (paso?.error) throw new Error(`${a.orden}: ${paso.error}`);
    console.log(`✓ ${a.orden}: solicitud "Por comprar" (${paso?.accion.tipo ?? "?"})`);
  }

  // ── Borrar el duplicado, solo si ya no le queda nada ──────────────────────
  if (acciones.some((a) => a.tipo === "borrar_catalogo")) {
    const [cat] = await fetchRecordsByIds(T_CATALOGO, [CATALOGO_DUPLICADO]);
    const enlaces = { unidades: links(cat?.fields?.["Productos Digitales"]).length, lineas: links(cat?.fields?.["Presupuesto por Orden"]).length };
    if (!cat) console.log("· el catálogo duplicado ya no existe");
    else if (!puedeBorrarCatalogo(enlaces)) {
      throw new Error(`No se borra el duplicado: todavía tiene ${enlaces.unidades} licencia(s) y ${enlaces.lineas} línea(s) enlazadas.`);
    } else {
      await airtableMutation(`${tableUrl(T_CATALOGO)}/${CATALOGO_DUPLICADO}`, { method: "DELETE" });
      console.log(`✓ catálogo duplicado borrado (${CATALOGO_DUPLICADO})`);
    }
  }
  console.log("\n✅ Listo. Vuelve a correr la vista previa: debe decir 0 acciones.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

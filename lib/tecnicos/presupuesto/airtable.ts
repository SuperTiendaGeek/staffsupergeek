import "server-only";

// Persistencia del presupuesto — tabla "Presupuesto por Orden".
// Reglas de negocio en ./reglas.ts; la carga a la orden en ./cargar.ts.
//
// Regla de la casa: nunca filtrar por campo de link. Las líneas de una orden
// se leen del inverso "Presupuesto por Orden" que trae la orden, y se buscan
// por RECORD_ID().

import { loadAirtableEnv } from "../config/airtable";
import type { EstadoLinea, InfoPedido, LineaPresupuesto, NuevaLineaInput, TipoLinea } from "./reglas";

export const T_PRESUPUESTO = "Presupuesto por Orden";
const T_ORDENES = "Órdenes de Reparación";

const F = {
  descripcion:  "Descripción",
  tipo:         "Tipo",
  cantidad:     "Cantidad",
  precio:       "Precio unitario",
  estado:       "Estado",
  notaCarga:    "Nota de carga",
  aprobadoPor:  "Aprobado por",
  fechaAprob:   "Fecha de aprobación",
  creadoPor:    "Creado por",
  orden:        "Orden de Reparación",
  servicio:     "Servicio del Catálogo",
  item:         "Artículo de inventario",
  productoCat:  "Producto digital del catálogo",
  cargoServicio: "Cargo: Servicio por Orden",
  cargoDigital: "Cargo: Producto digital",
  operacion:    "Operación Comercial",
} as const;

type Registro = { id: string; fields: Record<string, unknown> };

function cliente() {
  const { token, baseId } = loadAirtableEnv();
  return {
    baseUrl: `https://api.airtable.com/v0/${baseId}`,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } as Record<string, string>,
  };
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const c = cliente();
  const retry = new Set([429, 502, 503, 504]);
  let res: Response | null = null;
  for (let i = 0; i < 3; i++) {
    res = await fetch(url, { ...init, headers: { ...c.headers, ...(init?.headers ?? {}) }, cache: "no-store" });
    if (res.ok || !retry.has(res.status) || i === 2) break;
    await new Promise((r) => setTimeout(r, 400 * (i + 1)));
  }
  if (!res || !res.ok) throw new Error(`Airtable ${res?.status ?? "?"}: ${res ? await res.text() : "sin respuesta"}`);
  return (await res.json()) as T;
}

const url = (tabla: string, id?: string) => `${cliente().baseUrl}/${encodeURIComponent(tabla)}${id ? `/${encodeURIComponent(id)}` : ""}`;
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const texto = (v: unknown): string => (typeof v === "string" ? v : v && typeof v === "object" && "name" in v ? String((v as { name: unknown }).name) : "");
const num = (v: unknown): number => { const n = typeof v === "number" ? v : parseFloat(String(v ?? "")); return Number.isFinite(n) ? n : 0; };

function mapLinea(r: Registro): LineaPresupuesto {
  const f = r.fields;
  return {
    id: r.id,
    tipo: (texto(f[F.tipo]) || "Servicio") as TipoLinea,
    descripcion: texto(f[F.descripcion]),
    cantidad: num(f[F.cantidad]) || 1,
    precioUnitario: num(f[F.precio]),
    estado: (texto(f[F.estado]) || "Propuesta") as EstadoLinea,
    notaCarga: texto(f[F.notaCarga]),
    servicioCatalogoId: ids(f[F.servicio])[0] ?? null,
    itemId: ids(f[F.item])[0] ?? null,
    productoCatalogoId: ids(f[F.productoCat])[0] ?? null,
    cargoServicioId: ids(f[F.cargoServicio])[0] ?? null,
    cargoProductoDigitalId: ids(f[F.cargoDigital])[0] ?? null,
    operacionId: ids(f[F.operacion])[0] ?? null,
    aprobadoPor: texto(f[F.aprobadoPor]),
    fechaAprobacion: texto(f[F.fechaAprob]),
    creadoPor: texto(f[F.creadoPor]),
  };
}

async function porIds(tabla: string, lista: string[]): Promise<Registro[]> {
  const unicos = [...new Set(lista)].filter(Boolean);
  const out: Registro[] = [];
  for (let i = 0; i < unicos.length; i += 40) {
    const lote = unicos.slice(i, i + 40);
    const u = new URL(url(tabla));
    u.searchParams.set("filterByFormula", lote.length === 1 ? `RECORD_ID()='${lote[0]}'` : `OR(${lote.map((x) => `RECORD_ID()='${x}'`).join(",")})`);
    u.searchParams.set("pageSize", "100");
    const data = await pedir<{ records?: Registro[] }>(u.toString());
    out.push(...(data.records ?? []));
  }
  return out;
}

export async function listarLineas(ordenId: string): Promise<LineaPresupuesto[]> {
  const orden = await pedir<Registro>(url(T_ORDENES, ordenId));
  const lineaIds = ids(orden.fields[T_PRESUPUESTO]);
  const registros = await porIds(T_PRESUPUESTO, lineaIds);
  // Orden de alta (el inverso ya viene en el orden en que se crearon).
  const pos = new Map(lineaIds.map((id, i) => [id, i]));
  return registros.map(mapLinea).sort((a, b) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0));
}

export async function leerLinea(lineaId: string): Promise<(LineaPresupuesto & { ordenId: string | null }) | null> {
  try {
    const r = await pedir<Registro>(url(T_PRESUPUESTO, lineaId));
    return { ...mapLinea(r), ordenId: ids(r.fields[F.orden])[0] ?? null };
  } catch {
    return null;
  }
}

export async function crearLinea(
  ordenId: string,
  l: NuevaLineaInput,
  creadoPor: string,
  extra: { operacionId?: string } = {}
): Promise<LineaPresupuesto> {
  const fields: Record<string, unknown> = {
    [F.orden]: [ordenId],
    [F.tipo]: l.tipo,
    [F.descripcion]: l.descripcion.trim(),
    [F.cantidad]: l.cantidad,
    [F.precio]: l.precioUnitario,
    [F.estado]: "Propuesta",
    [F.creadoPor]: creadoPor,
  };
  if (l.tipo === "Servicio" && l.servicioCatalogoId) fields[F.servicio] = [l.servicioCatalogoId];
  if (l.tipo === "Repuesto" && l.itemId) fields[F.item] = [l.itemId];
  if (l.tipo === "Producto digital" && l.productoCatalogoId) fields[F.productoCat] = [l.productoCatalogoId];
  if (extra.operacionId) fields[F.operacion] = [extra.operacionId];
  const r = await pedir<Registro>(url(T_PRESUPUESTO), { method: "POST", body: JSON.stringify({ fields }) });
  return mapLinea(r);
}

export type CambiosLinea = Partial<{
  descripcion: string; cantidad: number; precioUnitario: number;
  itemId: string | null; estado: EstadoLinea; notaCarga: string;
  aprobadoPor: string; fechaAprobacion: string;
  cargoServicioId: string; cargoProductoDigitalId: string;
}>;

export async function actualizarLinea(lineaId: string, c: CambiosLinea): Promise<LineaPresupuesto> {
  const fields: Record<string, unknown> = {};
  if (c.descripcion !== undefined)    fields[F.descripcion] = c.descripcion.trim();
  if (c.cantidad !== undefined)       fields[F.cantidad] = c.cantidad;
  if (c.precioUnitario !== undefined) fields[F.precio] = c.precioUnitario;
  if (c.itemId !== undefined)         fields[F.item] = c.itemId ? [c.itemId] : [];
  if (c.estado !== undefined)         fields[F.estado] = c.estado;
  if (c.notaCarga !== undefined)      fields[F.notaCarga] = c.notaCarga;
  if (c.aprobadoPor !== undefined)    fields[F.aprobadoPor] = c.aprobadoPor;
  if (c.fechaAprobacion !== undefined) fields[F.fechaAprob] = c.fechaAprobacion;
  if (c.cargoServicioId)              fields[F.cargoServicio] = [c.cargoServicioId];
  if (c.cargoProductoDigitalId)       fields[F.cargoDigital] = [c.cargoProductoDigitalId];
  const r = await pedir<Registro>(url(T_PRESUPUESTO, lineaId), { method: "PATCH", body: JSON.stringify({ fields }) });
  return mapLinea(r);
}

export async function borrarLinea(lineaId: string): Promise<void> {
  await pedir(url(T_PRESUPUESTO, lineaId), { method: "DELETE" });
}

// ─── Estado del presupuesto de muchas órdenes a la vez (panel de cobros) ─────

export async function estadosLineasPorId(lineaIds: string[]): Promise<Map<string, EstadoLinea>> {
  const registros = await porIds(T_PRESUPUESTO, lineaIds);
  return new Map(registros.map((r) => [r.id, (texto(r.fields[F.estado]) || "Propuesta") as EstadoLinea]));
}

// ─── Repuestos bajo pedido: estado real de sus operaciones ───────────────────

const T_OPERACIONES = "Operación Comercial";
const T_OPCIONES = "Opciones";
const T_PROVEEDORES = "Shipping Proveedores";
const T_ITEMS = "Shipping Items";

export async function cargarInfoPedidos(operacionIds: string[]): Promise<Map<string, InfoPedido>> {
  const out = new Map<string, InfoPedido>();
  if (operacionIds.length === 0) return out;

  const operaciones = await porIds(T_OPERACIONES, operacionIds);
  const opcionIds = operaciones.map((o) => ids(o.fields["Opción Elegida"])[0]).filter((x): x is string => !!x);
  const itemIds = operaciones.flatMap((o) => ids(o.fields["Artículo físico"]).slice(0, 1));
  const [opciones, items] = await Promise.all([porIds(T_OPCIONES, opcionIds), porIds(T_ITEMS, itemIds)]);
  const opcionPorId = new Map(opciones.map((r) => [r.id, r]));
  const itemPorId = new Map(items.map((r) => [r.id, r]));
  const proveedores = await porIds(T_PROVEEDORES, opciones.map((o) => ids(o.fields["Proveedor"])[0]).filter((x): x is string => !!x));
  const proveedorPorId = new Map(proveedores.map((r) => [r.id, texto(r.fields["Nombre proveedor"])]));

  for (const op of operaciones) {
    const opcion = opcionPorId.get(ids(op.fields["Opción Elegida"])[0] ?? "");
    const item = itemPorId.get(ids(op.fields["Artículo físico"])[0] ?? "");
    const numOrNull = (v: unknown) => (v === undefined || v === null || v === "" ? null : num(v));
    out.set(op.id, {
      operacionId: op.id,
      codigo: texto(op.fields["Código Operación"]) || op.id,
      estadoOperacion: texto(op.fields["Estado"]),
      opcionElegidaId: opcion?.id ?? null,
      proveedorNombre: opcion ? proveedorPorId.get(ids(opcion.fields["Proveedor"])[0] ?? "") ?? "" : "",
      urlProveedor: opcion ? texto(opcion.fields["URL Proveedor"]) : "",
      costoProveedor: opcion ? numOrNull(opcion.fields["Costo Proveedor"]) : null,
      precioCliente: opcion ? numOrNull(opcion.fields["Precio Venta Cliente"]) : null,
      tiempoEstimado: opcion ? texto(opcion.fields["Tiempo Estimado"]) : "",
      item: item ? { id: item.id, sku: texto(item.fields["SKU"]) || item.id, recibido: item.fields["Recibido"] === true } : null,
    });
  }
  return out;
}

export async function clienteDeOrden(ordenId: string): Promise<{ clienteId: string | null; idVisible: string }> {
  const orden = await pedir<Registro>(url(T_ORDENES, ordenId));
  return { clienteId: ids(orden.fields["Cliente"])[0] ?? null, idVisible: texto(orden.fields["ID"]) || ordenId };
}

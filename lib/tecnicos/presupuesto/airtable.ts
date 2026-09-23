import "server-only";

// Persistencia del presupuesto — tabla "Presupuesto por Orden".
// Reglas de negocio en ./reglas.ts; la carga a la orden en ./cargar.ts.
//
// Regla de la casa: nunca filtrar por campo de link. Las líneas de una orden
// se leen del inverso "Presupuesto por Orden" que trae la orden, y se buscan
// por RECORD_ID().

import { loadAirtableEnv } from "../config/airtable";
import { normalizarPrioridad, type EstadoLinea, type InfoPedido, type LineaPresupuesto, type NuevaLineaInput, type Prioridad, type TipoLinea } from "./reglas";

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
  bajoPedido:   "Bajo pedido",
  proveedor:    "Proveedor",
  urlProveedor: "URL proveedor",
  costoProveedor: "Costo proveedor",
  tiempo:       "Tiempo estimado",
  categoria:    "Categoría",
  historial:    "Historial",
  prioridad:    "Prioridad",
  notaCliente:  "Nota para el cliente",
  grupo:        "Grupo de alternativas",
  respuestaCliente: "Respuesta cliente",
  huellaRespondida: "Huella respondida",
  fechaRespuesta:   "Fecha respuesta cliente",
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
    // Una línea creada con el flujo anterior (operación desde la cotización)
    // no tiene la casilla, pero sí la operación: también es bajo pedido.
    bajoPedido: f[F.bajoPedido] === true || ids(f[F.operacion]).length > 0,
    proveedorId: ids(f[F.proveedor])[0] ?? null,
    urlProveedor: texto(f[F.urlProveedor]),
    costoProveedor: f[F.costoProveedor] === undefined || f[F.costoProveedor] === null ? null : num(f[F.costoProveedor]),
    tiempoEstimado: texto(f[F.tiempo]),
    categoria: texto(f[F.categoria]),
    historial: texto(f[F.historial]),
    aprobadoPor: texto(f[F.aprobadoPor]),
    fechaAprobacion: texto(f[F.fechaAprob]),
    creadoPor: texto(f[F.creadoPor]),
    prioridad: normalizarPrioridad(texto(f[F.prioridad])),
    notaCliente: texto(f[F.notaCliente]),
    grupoAlternativas: texto(f[F.grupo]),
    respuestaCliente: (texto(f[F.respuestaCliente]) || "") as LineaPresupuesto["respuestaCliente"],
    huellaRespondida: texto(f[F.huellaRespondida]),
    fechaRespuestaCliente: texto(f[F.fechaRespuesta]),
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
  extra: { operacionId?: string; grupoAlternativas?: string } = {}
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
  fields[F.prioridad] = normalizarPrioridad(l.prioridad);
  if (l.notaCliente?.trim()) fields[F.notaCliente] = l.notaCliente.trim();
  if (extra.grupoAlternativas) fields[F.grupo] = extra.grupoAlternativas;
  if (l.bajoPedido) {
    fields[F.bajoPedido] = true;
    fields[F.proveedor] = [l.bajoPedido.proveedorId];
    fields[F.categoria] = l.bajoPedido.categoria;
    if (l.bajoPedido.costoProveedor != null) fields[F.costoProveedor] = l.bajoPedido.costoProveedor;
    if (l.bajoPedido.urlProveedor) fields[F.urlProveedor] = l.bajoPedido.urlProveedor;
    if (l.bajoPedido.tiempoEstimado) fields[F.tiempo] = l.bajoPedido.tiempoEstimado;
  }
  const r = await pedir<Registro>(url(T_PRESUPUESTO), { method: "POST", body: JSON.stringify({ fields }) });
  return mapLinea(r);
}

export type CambiosLinea = Partial<{
  descripcion: string; cantidad: number; precioUnitario: number;
  itemId: string | null; estado: EstadoLinea; notaCarga: string;
  aprobadoPor: string; fechaAprobacion: string;
  /** null desvincula el cargo (se quitó desde su tarjeta). */
  cargoServicioId: string | null; cargoProductoDigitalId: string | null;
  /** string → vincula; null → suelta la operación (recotizar/cancelar). */
  operacionId: string | null;
  /** Se AGREGA al historial existente (nunca se reescribe). */
  agregarHistorial: { anterior: string; entrada: string };
  prioridad: Prioridad;
  notaCliente: string;
  /** "" quita la línea de su grupo de alternativas. */
  grupoAlternativas: string;
  /** Respuesta del cliente desde el enlace público. */
  respuestaCliente: { valor: "Aprobó" | "No aprobó"; huella: string; fecha: string };
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
  if (c.cargoServicioId !== undefined)        fields[F.cargoServicio] = c.cargoServicioId ? [c.cargoServicioId] : [];
  if (c.cargoProductoDigitalId !== undefined) fields[F.cargoDigital] = c.cargoProductoDigitalId ? [c.cargoProductoDigitalId] : [];
  if (c.operacionId !== undefined)    fields[F.operacion] = c.operacionId ? [c.operacionId] : [];
  if (c.prioridad !== undefined)      fields[F.prioridad] = c.prioridad;
  if (c.notaCliente !== undefined)    fields[F.notaCliente] = c.notaCliente.trim();
  if (c.grupoAlternativas !== undefined) fields[F.grupo] = c.grupoAlternativas;
  if (c.respuestaCliente) {
    fields[F.respuestaCliente] = c.respuestaCliente.valor;
    fields[F.huellaRespondida] = c.respuestaCliente.huella;
    fields[F.fechaRespuesta]   = c.respuestaCliente.fecha;
  }
  if (c.agregarHistorial)             fields[F.historial] = [c.agregarHistorial.anterior, c.agregarHistorial.entrada].filter(Boolean).join("\n");
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

  const T_PAGOS = "Shipping Pagos";
  const pagos = await porIds(T_PAGOS, items.flatMap((i) => ids(i.fields["Shipping Pagos (Items relacionados)"])));
  const pagoPorId = new Map(pagos.map((r) => [r.id, r]));

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
      item: item
        ? {
            id: item.id,
            sku: texto(item.fields["SKU"]) || item.id,
            recibido: item.fields["Recibido"] === true,
            estado: texto(item.fields["Estado Item"]),
            // Solo los pagos no anulados comprometen dinero con el proveedor.
            pagos: ids(item.fields["Shipping Pagos (Items relacionados)"])
              .map((pid) => pagoPorId.get(pid))
              .filter((r): r is Registro => !!r && texto(r.fields["Estado Pago"]).toLowerCase() !== "anulado")
              .map((r) => ({ id: r.id, codigo: texto(r.fields["Pago ID"]) || r.id, estado: texto(r.fields["Estado Pago"]) })),
          }
        : null,
    });
  }
  return out;
}

export async function clienteDeOrden(ordenId: string): Promise<{ clienteId: string | null; idVisible: string }> {
  const orden = await pedir<Registro>(url(T_ORDENES, ordenId));
  return { clienteId: ids(orden.fields["Cliente"])[0] ?? null, idVisible: texto(orden.fields["ID"]) || ordenId };
}

export async function nombresProveedores(idsProv: string[]): Promise<Record<string, string>> {
  const registros = await porIds(T_PROVEEDORES, idsProv);
  return Object.fromEntries(registros.map((r) => [r.id, texto(r.fields["Nombre proveedor"])]));
}

// ─── Enlace público de aprobación ────────────────────────────────────────────
// Campos creados el 21-sep-2026. Reglas en ./enlace-reglas.ts.

const T_RESPUESTAS = "Presupuesto Respuestas";
const FO = {
  token:     "Enlace presupuesto token",
  vence:     "Enlace presupuesto vence",
  intentos:  "Enlace presupuesto intentos",
  bloqueado: "Enlace presupuesto bloqueado hasta",
} as const;
/** Inverso "Presupuesto Respuestas" en la orden, leído por ID de campo. */
const FID_ORDEN_RESPUESTAS = "fldUt7pkITeeqHSeZ";

export type OrdenEnlace = {
  id: string;
  idVisible: string;
  fechaIngreso: string;
  clienteNombre: string;
  cedula: string;
  telefono: string;
  equipo: string;
  diagnostico: string;
  recomendaciones: string;
  estadoOrden: string;
  token: string;
  vence: string;
  intentos: number;
  bloqueadoHasta: string;
};

function primero(f: Record<string, unknown>, nombres: string[]): string {
  for (const n of nombres) {
    const v = f[n];
    const t = Array.isArray(v) ? texto(v[0]) : typeof v === "number" ? String(v) : texto(v);
    if (t.trim()) return t.trim();
  }
  return "";
}

function mapOrdenEnlace(r: Registro): OrdenEnlace {
  const f = r.fields;
  return {
    id: r.id,
    idVisible: primero(f, ["ID"]) || r.id,
    fechaIngreso: primero(f, ["Fecha de Ingreso"]),
    clienteNombre: primero(f, ["Cliente Nombre", "Nombre Cliente", "ClienteTXT"]),
    cedula: primero(f, ["CedulaTXT", "CédulaTXT", "Cedula", "Cédula"]),
    telefono: primero(f, ["TelefonoTXT", "Telefono"]),
    equipo: primero(f, ["Equipo"]),
    diagnostico: primero(f, ["Diagnostico Inicial"]),
    recomendaciones: primero(f, ["Recomendaciones"]),
    estadoOrden: primero(f, ["Estado Actual"]),
    token: texto(f[FO.token]),
    vence: texto(f[FO.vence]),
    intentos: num(f[FO.intentos]),
    bloqueadoHasta: texto(f[FO.bloqueado]),
  };
}

export async function leerOrdenEnlace(ordenId: string): Promise<OrdenEnlace> {
  return mapOrdenEnlace(await pedir<Registro>(url(T_ORDENES, ordenId)));
}

/** El token ya viene validado con TOKEN_REGEX (sin comillas ni llaves). */
export async function buscarOrdenPorToken(token: string): Promise<OrdenEnlace | null> {
  const u = new URL(url(T_ORDENES));
  u.searchParams.set("filterByFormula", `{${FO.token}}='${token}'`);
  u.searchParams.set("maxRecords", "2");
  const data = await pedir<{ records?: Registro[] }>(u.toString());
  const recs = data.records ?? [];
  // Un token repetido sería un error grave: se rechaza en vez de adivinar.
  return recs.length === 1 ? mapOrdenEnlace(recs[0]) : null;
}

export async function guardarEnlace(ordenId: string, token: string, vence: string): Promise<void> {
  await pedir(url(T_ORDENES, ordenId), {
    method: "PATCH",
    body: JSON.stringify({ fields: { [FO.token]: token, [FO.vence]: vence, [FO.intentos]: 0, [FO.bloqueado]: null } }),
  });
}

export async function guardarIntentosEnlace(ordenId: string, intentos: number, bloqueadoHasta: string | null): Promise<void> {
  await pedir(url(T_ORDENES, ordenId), {
    method: "PATCH",
    body: JSON.stringify({ fields: { [FO.intentos]: intentos, [FO.bloqueado]: bloqueadoHasta } }),
  });
}

export type RespuestaFirmada = {
  id: string;
  fecha: string;
  nombre: string;
  detalle: import("./enlace-reglas").DetalleRespondido[];
};

/** Respuestas firmadas de la orden, de la más nueva a la más vieja. */
export async function leerRespuestasOrden(ordenId: string): Promise<RespuestaFirmada[]> {
  // Ojo: el GET de UN registro no acepta fields[] (Airtable responde 422).
  const u = new URL(url(T_ORDENES, ordenId));
  u.searchParams.set("returnFieldsByFieldId", "true");
  const orden = await pedir<Registro>(u.toString());
  const registros = await porIds(T_RESPUESTAS, ids(orden.fields[FID_ORDEN_RESPUESTAS]));
  return registros
    .map((r) => {
      let detalle: RespuestaFirmada["detalle"] = [];
      try {
        const j = JSON.parse(texto(r.fields["Detalle"]) || "{}") as { lineas?: RespuestaFirmada["detalle"] };
        detalle = Array.isArray(j.lineas) ? j.lineas : [];
      } catch { /* detalle ilegible: se ignora, no rompe la vista */ }
      return { id: r.id, fecha: texto(r.fields["Fecha"]), nombre: texto(r.fields["Nombre firmante"]), detalle };
    })
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

export async function crearRespuestaFirmada(input: {
  ordenId: string;
  codigo: string;
  fecha: string;
  nombre: string;
  cedulaVerificada: boolean;
  ip: string;
  dispositivo: string;
  lineaIds: string[];
  aprobadas: number;
  noAprobadas: number;
  totalAprobado: number;
  detalle: unknown;
}): Promise<string> {
  const r = await pedir<Registro>(url(T_RESPUESTAS), {
    method: "POST",
    body: JSON.stringify({
      fields: {
        "Código": input.codigo,
        "Orden de Reparación": [input.ordenId],
        "Líneas respondidas": input.lineaIds,
        "Fecha": input.fecha,
        "Nombre firmante": input.nombre,
        "Cédula verificada": input.cedulaVerificada,
        "Aceptó términos": true,
        "IP": input.ip.slice(0, 100),
        "Dispositivo": input.dispositivo.slice(0, 250),
        "Aprobadas": input.aprobadas,
        "No aprobadas": input.noAprobadas,
        "Total aprobado": input.totalAprobado,
        "Detalle": JSON.stringify(input.detalle).slice(0, 95_000),
      },
    }),
  });
  return r.id;
}

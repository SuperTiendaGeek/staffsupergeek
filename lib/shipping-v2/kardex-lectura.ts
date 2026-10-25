import "server-only";

// Lectura del Kardex para las pantallas (punto 12). Reglas en kardex.ts.
//
// Lo informativo (lo que viene en camino, las reservas y los cambios de
// código) NO está en el libro: se arma aquí al mostrar, desde sus propias
// tablas, y se pinta en gris. Así el libro solo tiene lo que mueve el saldo.
//
// Costos y valores solo para el Administrador (decisión 3): para el Staff se
// limpian aquí, en el servidor, antes de salir.

import {
  diferenciasKardex,
  inventarioAFecha,
  registroDeCampos,
  resumenPeriodo,
  saldosPorRegistro,
  sinCostos,
  unidadesEnLibro,
  type AmbitoKardex,
  type DiferenciaKardex,
  type DocumentoTipoKardex,
  type MovimientoKardex,
  type ResumenPeriodo,
} from "./kardex";
import { leerItems, leerMovimientos, leerMovimientosDeRegistros, listarTabla } from "./kardex-registro";

export type KardexInformativo = {
  id: string;
  fecha: string;
  tipo: "en-camino" | "apartada" | "codigo";
  texto: string;
  registroId: string;
  serie: string;
  cantidad: number;
  documento: string;
  documentoTipo: DocumentoTipoKardex | "Reserva" | "";
  documentoId: string;
  contraparte: string;
  hechoPor: string;
};

export type KardexUnidad = {
  id: string;
  serie: string;
  estado: string;
  ambito: AmbitoKardex;
  enTienda: number;
  enCamino: number;
  /** Ya salió (vendida, agotada, dada de baja…). */
  salio: boolean;
  esLote: boolean;
};

export type KardexProducto = {
  sku: string;
  nombre: string;
  categoria: string;
  condicion: string;
  unidades: KardexUnidad[];
  movimientos: MovimientoKardex[];
  informativos: KardexInformativo[];
  cabecera: { enTienda: number; enCamino: number; apartadas: number; libres: number };
  diferencias: DiferenciaKardex[];
  /** Códigos legibles de cajas y órdenes de compra (por id). */
  codigos: Record<string, string>;
  verCostos: boolean;
};

function texto(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return texto(v[0]);
  if (v && typeof v === "object" && "name" in (v as Record<string, unknown>)) return String((v as { name: unknown }).name ?? "");
  return "";
}
function numero(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (Array.isArray(v)) return numero(v[0]);
  return 0;
}
function ids(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
function norm(v: string) {
  return v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}
function escapar(v: string) {
  return v.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
/** El Staff no ve costos (decisión 3): ni valores ni los ajustes de costo. */
function paraStaff(movs: MovimientoKardex[]): MovimientoKardex[] {
  return movs.filter((m) => m.tipo !== "Costo").map((m) => sinCostos(m));
}
const SALIDAS = new Set(["vendido", "agotado", "dado de baja", "cancelado", "perdido", "usado en reparacion", "archivado"]);

/** SKU actual a partir de lo que escribió o escaneó el usuario: SKU, SKU anterior, serie o record id. */
export async function resolverSkuKardex(q: string): Promise<string | null> {
  const valor = q.trim();
  if (!valor) return null;
  if (/^rec[A-Za-z0-9]{14}$/.test(valor)) {
    const f = (await leerItems([valor])).get(valor);
    return f ? texto(f["SKU"]) || null : null;
  }
  const v = escapar(valor.toUpperCase());
  const recs = await listarTabla("Shipping Items", {
    formula: `OR(UPPER({SKU})='${v}', UPPER({Número de serie}&'')='${v}', FIND('${v}', UPPER({SKUs anteriores}&'')))`,
    campos: ["SKU", "SKUs anteriores"],
    max: 20,
  });
  const exacto = recs.find((r) => texto(r.fields["SKU"]).toUpperCase() === valor.toUpperCase());
  return texto((exacto ?? recs[0])?.fields["SKU"]) || null;
}

export async function getKardexProducto(sku: string, opciones: { verCostos: boolean }): Promise<KardexProducto | null> {
  const recs = await listarTabla("Shipping Items", { formula: `UPPER({SKU})='${escapar(sku.toUpperCase())}'` });
  if (!recs.length) return null;
  const registros = recs.map((r) => ({ id: r.id, f: r.fields, createdTime: r.createdTime ?? "" }));
  const movimientos = await leerMovimientosDeRegistros(registros.map((r) => r.id));
  const saldos = saldosPorRegistro(movimientos);

  const unidades: KardexUnidad[] = registros.map(({ id, f }) => {
    const estado = texto(f["Estado Item"]);
    const enTienda = unidadesEnLibro(f);
    const cancelado = norm(estado) === "cancelado";
    return {
      id,
      serie: texto(f["Número de serie"]),
      estado,
      ambito: f["Es uso local"] === true ? "Activo" : "Mercadería",
      enTienda,
      enCamino: f["Recibido"] !== true && !cancelado ? Math.max(0, Math.round(numero(f["Cantidad"]))) : 0,
      salio: SALIDAS.has(norm(estado)) || (f["Recibido"] === true && enTienda === 0),
      esLote: texto(f["Seguimiento"]) === "Lote" || Math.round(numero(f["Unidades compradas"]) || numero(f["Cantidad"])) > 1,
    };
  });

  // ── Informativos ──
  const informativos: KardexInformativo[] = [];
  for (const { id, f, createdTime } of registros) {
    const origen = norm(texto(f["Origen del artículo"]));
    const vieneDeAfuera = origen.startsWith("proveedor");
    const compradas = Math.round(numero(f["Unidades compradas"]) || numero(f["Cantidad"]));
    if (vieneDeAfuera && compradas > 0) {
      const caja = ids(f["Shipping Packings"])[0] ?? "";
      const orden = ids(f["Orden de compra"])[0] ?? "";
      informativos.push({
        id: `camino-${id}`,
        fecha: texto(f["Fecha de registro"]) || createdTime,
        tipo: "en-camino",
        texto: `Compra registrada · en camino +${compradas}`,
        registroId: id,
        serie: texto(f["Número de serie"]),
        cantidad: compradas,
        documento: "",
        documentoTipo: orden ? "Orden de compra" : caja ? "Caja" : "",
        documentoId: orden || caja,
        contraparte: "",
        hechoPor: texto(f["Registrado por"]),
      });
    }
  }
  const reservaIds = registros.flatMap(({ f }) => ids(f["Reservas"]));
  const cambioIds = registros.flatMap(({ f }) => ids(f["Shipping Cambios de código"]));
  const porId = (lista: string[]) => (lista.length === 1 ? `RECORD_ID()='${lista[0]}'` : `OR(${lista.map((x) => `RECORD_ID()='${x}'`).join(",")})`);
  const [reservas, cambios] = await Promise.all([
    reservaIds.length ? listarTabla("Reservas", { formula: porId([...new Set(reservaIds)].slice(0, 60)), campos: ["Número", "Fecha", "Estado", "Cliente Nombre", "Shipping Item", "Registrado Por"] }) : Promise.resolve([]),
    cambioIds.length ? listarTabla("Shipping Cambios de código", { formula: porId([...new Set(cambioIds)].slice(0, 30)), campos: ["Antes", "Ahora", "Motivo", "Fecha", "Hecho por", "Artículos"] }) : Promise.resolve([]),
  ]);
  const serieDe = new Map(unidades.map((u) => [u.id, u.serie]));
  for (const r of reservas) {
    const itemId = ids(r.fields["Shipping Item"])[0] ?? "";
    const estado = texto(r.fields["Estado"]);
    informativos.push({
      id: `reserva-${r.id}`,
      fecha: texto(r.fields["Fecha"]) || r.createdTime || "",
      tipo: "apartada",
      texto: `Apartada${estado && norm(estado) !== "activa" ? ` · ${estado.toLowerCase()}` : ""}`,
      registroId: itemId,
      serie: serieDe.get(itemId) ?? "",
      cantidad: 0,
      documento: texto(r.fields["Número"]),
      documentoTipo: "Reserva",
      documentoId: r.id,
      contraparte: texto(r.fields["Cliente Nombre"]),
      hechoPor: texto(r.fields["Registrado Por"]),
    });
  }
  for (const c of cambios) {
    informativos.push({
      id: `codigo-${c.id}`,
      fecha: texto(c.fields["Fecha"]) || c.createdTime || "",
      tipo: "codigo",
      texto: `Cambio de código · antes ${texto(c.fields["Antes"])}`,
      registroId: "",
      serie: "",
      cantidad: 0,
      documento: texto(c.fields["Motivo"]),
      documentoTipo: "",
      documentoId: "",
      contraparte: "",
      hechoPor: texto(c.fields["Hecho por"]),
    });
  }

  // ── Códigos de cajas y órdenes (para mostrar "PK-000057" en vez de un id) ──
  const cajas = new Set<string>();
  const ordenes = new Set<string>();
  for (const m of movimientos) {
    if (m.documentoTipo === "Caja" && m.documentoId.startsWith("rec") && !m.documento) cajas.add(m.documentoId);
    if (m.documentoTipo === "Orden de compra" && m.documentoId.startsWith("rec")) ordenes.add(m.documentoId);
  }
  for (const i of informativos) {
    if (i.documentoTipo === "Caja" && i.documentoId) cajas.add(i.documentoId);
    if (i.documentoTipo === "Orden de compra" && i.documentoId) ordenes.add(i.documentoId);
  }
  const codigos: Record<string, string> = {};
  const [recCajas, recOrdenes] = await Promise.all([
    cajas.size ? listarTabla("Shipping Packings", { formula: porId([...cajas].slice(0, 40)), campos: ["Packing ID"] }).catch(() => []) : Promise.resolve([]),
    ordenes.size ? listarTabla("Shipping Órdenes de compra", { formula: porId([...ordenes].slice(0, 40)), campos: ["OC ID"] }).catch(() => []) : Promise.resolve([]),
  ]);
  for (const r of recCajas) codigos[r.id] = texto(r.fields["Packing ID"]);
  for (const r of recOrdenes) codigos[r.id] = texto(r.fields["OC ID"]);

  // ── Proveedor de cada registro (las compras y lo que viene en camino) ──
  const provIds = [...new Set(registros.flatMap(({ f }) => ids(f["Proveedor de compra"])))];
  const provRecs = provIds.length ? await listarTabla("Shipping Proveedores", { formula: porId(provIds.slice(0, 40)), campos: ["Nombre proveedor"] }).catch(() => []) : [];
  const nombreProv = new Map(provRecs.map((r) => [r.id, texto(r.fields["Nombre proveedor"])]));
  const provDe = new Map(registros.map(({ id, f }) => [id, nombreProv.get(ids(f["Proveedor de compra"])[0] ?? "") ?? ""]));
  for (const i of informativos) if (i.tipo === "en-camino" && !i.contraparte) i.contraparte = provDe.get(i.registroId) ?? "";
  const COMPRAS = new Set(["Compra recibida", "Regalo del proveedor", "Llegaron más de lo comprado", "Compra registrada de más"]);
  for (const m of movimientos) if (!m.contraparte && COMPRAS.has(m.motivo)) m.contraparte = provDe.get(m.registroId) ?? "";

  const vivos = registros.filter(({ f }) => f["Recibido"] === true);
  const apartadas = vivos.reduce((s, { f }) => s + Math.min(Math.round(numero(f["Cantidad Reservada"])), unidadesEnLibro(f)), 0);
  const enTienda = unidades.reduce((s, u) => s + u.enTienda, 0);
  const primero = registros.find(({ f }) => f["Recibido"] === true) ?? registros[0];
  const reg = registroDeCampos(primero.id, primero.f);
  return {
    sku: reg.sku,
    nombre: reg.nombre,
    categoria: reg.categoria,
    condicion: texto(primero.f["Condición"]),
    unidades,
    movimientos: opciones.verCostos ? movimientos : paraStaff(movimientos),
    informativos,
    cabecera: { enTienda, enCamino: unidades.reduce((s, u) => s + u.enCamino, 0), apartadas, libres: Math.max(0, enTienda - apartadas) },
    diferencias: diferenciasKardex(registros.map(({ id, f }) => ({ id, sku: reg.sku, enLibro: unidadesEnLibro(f) })), saldos),
    codigos,
    verCostos: opciones.verCostos,
  };
}

/** Movimientos de un periodo (pantalla Movimientos y Dados de baja). */
export async function getKardexMovimientos(opciones: { desde?: string; hasta?: string; soloBajas?: boolean; verCostos: boolean }) {
  const formulaExtra = opciones.soloBajas ? `OR({Motivo}='Dada de baja', {Motivo}='Baja revertida')` : undefined;
  const movimientos = await leerMovimientos({ desde: opciones.desde, hasta: opciones.hasta, formulaExtra });
  // Dados de baja: cuántas siguen de baja hoy en cada registro (para "Revertir").
  let bajasVigentes: Record<string, number> = {};
  if (opciones.soloBajas && movimientos.length) {
    const items = await leerItems(movimientos.map((m) => m.registroId));
    bajasVigentes = Object.fromEntries([...items].map(([id, f]) => [id, Math.round(numero(f["Unidades dadas de baja"]))]));
  }
  return {
    movimientos: opciones.verCostos ? movimientos : paraStaff(movimientos),
    bajasVigentes,
    verCostos: opciones.verCostos,
  };
}

export type KardexResumen = ResumenPeriodo & { inventario: { unidades: number; valor: number }; desde: string; hasta: string };

/** Resumen por periodo + inventario a la fecha final (solo Administrador). */
export async function getKardexResumen(opciones: { desde: string; hasta: string; agrupar: "categoria" | "sku"; ambito: AmbitoKardex }): Promise<KardexResumen> {
  const movimientos = await leerMovimientos({ hasta: opciones.hasta });
  return {
    ...resumenPeriodo(movimientos, opciones),
    inventario: inventarioAFecha(movimientos, opciones.hasta, opciones.ambito),
    desde: opciones.desde,
    hasta: opciones.hasta,
  };
}

/** Movimientos de un registro (pestaña Kardex de la ficha). */
export async function getKardexRegistro(itemId: string, opciones: { verCostos: boolean }) {
  const [items, movimientos] = await Promise.all([leerItems([itemId]), leerMovimientosDeRegistros([itemId])]);
  const f = items.get(itemId);
  const libro = saldosPorRegistro(movimientos).get(itemId)?.cantidad ?? 0;
  return {
    movimientos: opciones.verCostos ? movimientos : paraStaff(movimientos),
    sku: f ? texto(f["SKU"]) : "",
    cuadra: f ? libro === unidadesEnLibro(f) : true,
    libro,
    inventario: f ? unidadesEnLibro(f) : 0,
    verCostos: opciones.verCostos,
  };
}

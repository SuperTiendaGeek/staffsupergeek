// Conteo físico de inventario (punto 10c-2 de la auditoría Shipping V2,
// 18-oct-2026). Solo reglas, sin red.
//
// - Se cuenta lo que está en la tienda de las categorías elegidas: recibido,
//   con unidades y no vendido/dado de baja (los activos de la tienda solo si
//   se eligen).
// - Una UNIDAD (un equipo) se identifica por su serie; si se escanea el SKU de
//   un producto con varias unidades, se elige cuál (o "sin identificar").
//   Un LOTE (cables, accesorios) se cuenta por cantidad a nivel de SKU.
// - Conteo a la vista (decisión del dueño, 18-oct noche): quien cuenta ve
//   "N de N" y lo que falta por encontrar. Ajustar el stock es solo del
//   Administrador, después de terminar.
// - Se puede seguir vendiendo: lo que cambió después de empezar el conteo va
//   aparte ("Cambió al contar") y no se toma como faltante ni sobrante.

import { normalizarSerie } from "./unidades-serie";

export type ItemConteo = {
  id: string;
  sku: string;
  nombre: string;
  categoria: string;
  estado: string;
  cantidad: number;
  recibido: boolean;
  usoLocal: boolean;
  seguimiento: string;
  numeroSerie: string;
  costoUnidad: number | null;
  ultimaActualizacion: string;
};

export type TipoLinea = "Unidad" | "Sin identificar" | "Lote" | "Sin registro";

export type LineaConteo = {
  id: string;
  codigo: string;
  itemId?: string;
  sku: string;
  serie: string;
  cantidad: number;
  tipo: TipoLinea;
  contadoPor: string;
  fecha: string;
  anulada: boolean;
};

export type AlcanceConteo = { categorias: string[]; incluyeActivos: boolean };

const FUERA = new Set(["vendido", "agotado", "dado de baja", "cancelado", "archivado", "usado en reparacion", "perdido en tienda", "destinado a partes", "devuelto a proveedor", "desarmado completamente"]);

function normal(texto?: string | null) {
  return String(texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function normalCodigo(texto?: string | null) {
  return String(texto ?? "").trim().toUpperCase();
}

/** ¿Está en la tienda y entra en este conteo? */
export function entraEnConteo(item: ItemConteo, alcance: AlcanceConteo): boolean {
  if (!item.recibido || item.cantidad <= 0 || FUERA.has(normal(item.estado))) return false;
  if (item.usoLocal) return alcance.incluyeActivos;
  if (!alcance.categorias.length) return true;
  return alcance.categorias.some((c) => normal(c) === normal(item.categoria));
}

/** Un equipo se cuenta uno por uno; lo demás, por cantidad. */
export function esUnidad(item: Pick<ItemConteo, "seguimiento" | "cantidad">): boolean {
  const s = normal(item.seguimiento);
  if (s === "unidad") return true;
  if (s === "lote") return false;
  return item.cantidad <= 1;
}

/** Líneas vivas (sin las anuladas). */
export function lineasVivas(lineas: LineaConteo[]) {
  return lineas.filter((l) => !l.anulada);
}

// ─── Leer un código ──────────────────────────────────────────────────────────

export type Lectura =
  | { tipo: "unidad"; item: ItemConteo }
  | { tipo: "ya-contada"; item: ItemConteo; por: string; fecha: string }
  | { tipo: "elegir"; sku: string; nombre: string; opciones: ItemConteo[]; contadas: ItemConteo[] }
  | { tipo: "lote"; item: ItemConteo }
  | { tipo: "sin-registro"; codigo: string };

/**
 * Qué es lo que se escaneó o escribió. Busca primero por serie (la unidad
 * exacta) y luego por SKU. `items` son TODOS los artículos (un código de algo
 * vendido o de otra categoría también se reconoce: en la revisión sale como
 * sobrante, no como "sin registro").
 */
export function leerCodigo(codigo: string, items: ItemConteo[], lineas: LineaConteo[]): Lectura {
  const texto = normalCodigo(codigo);
  if (!texto) return { tipo: "sin-registro", codigo: "" };
  const vivas = lineasVivas(lineas);
  const contadaPor = (id: string) => vivas.find((l) => l.itemId === id && l.tipo === "Unidad");

  const serie = normalizarSerie(texto);
  const porSerie = serie ? items.filter((i) => normalizarSerie(i.numeroSerie) === serie) : [];
  const conSerie = porSerie.find((i) => !FUERA.has(normal(i.estado))) ?? porSerie[0];
  if (conSerie) {
    const ya = contadaPor(conSerie.id);
    return ya ? { tipo: "ya-contada", item: conSerie, por: ya.contadoPor, fecha: ya.fecha } : { tipo: "unidad", item: conSerie };
  }

  const delSku = items.filter((i) => normalCodigo(i.sku) === texto);
  if (!delSku.length) return { tipo: "sin-registro", codigo: texto };
  const enTienda = delSku.filter((i) => i.recibido && i.cantidad > 0 && !FUERA.has(normal(i.estado)));
  const base = enTienda.length ? enTienda : delSku;
  if (base.some((i) => !esUnidad(i))) return { tipo: "lote", item: base.find((i) => !esUnidad(i)) ?? base[0] };
  if (base.length === 1) {
    const ya = contadaPor(base[0].id);
    return ya ? { tipo: "ya-contada", item: base[0], por: ya.contadoPor, fecha: ya.fecha } : { tipo: "unidad", item: base[0] };
  }
  return {
    tipo: "elegir",
    sku: base[0].sku,
    nombre: base[0].nombre,
    opciones: base.filter((i) => !contadaPor(i.id)),
    contadas: base.filter((i) => Boolean(contadaPor(i.id))),
  };
}

/** Busca por SKU, serie o nombre (ingreso manual cuando el lector falla). */
export function buscarParaContar(texto: string, items: ItemConteo[], max = 12): ItemConteo[] {
  const q = normal(texto);
  if (q.length < 2) return [];
  const palabras = q.split(/\s+/).filter(Boolean);
  const vistos = new Set<string>();
  const salida: ItemConteo[] = [];
  const candidatos = items.filter((i) => i.recibido && i.cantidad > 0 && !FUERA.has(normal(i.estado)));
  for (const i of candidatos) {
    const hay = `${normal(i.sku)} ${normal(i.numeroSerie)} ${normal(i.nombre)}`;
    if (!palabras.every((p) => hay.includes(p))) continue;
    const clave = esUnidad(i) ? i.id : `sku:${normalCodigo(i.sku)}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    salida.push(i);
    if (salida.length >= max) break;
  }
  return salida;
}

// ─── Comparar (revisión) ─────────────────────────────────────────────────────

export type FilaConteo = {
  sku: string;
  nombre: string;
  tipo: "unidad" | "lote";
  sistema: number;
  contado: number;
  /** Unidades que el sistema tiene y nadie contó (las que no cubrió un "sin identificar"). */
  faltan: ItemConteo[];
  /** Unidades contadas que el sistema no tenía en la tienda (vendidas, de baja, de otra categoría…). */
  sobran: ItemConteo[];
  sinIdentificar: number;
  /** Contadas "sin identificar" que no cubrieron ninguna faltante (sobran). */
  sinIdentificarDeMas: number;
  /** Para lotes: los registros del SKU, del más antiguo al más nuevo. */
  registros: ItemConteo[];
  /** Diferencia a costo (negativa si falta). */
  valor: number;
};

export type ResultadoConteo = {
  coinciden: FilaConteo[];
  faltan: FilaConteo[];
  sobran: FilaConteo[];
  sinRegistro: Array<{ codigo: string; cantidad: number; contadoPor: string }>;
  /** Artículos que cambiaron después de empezar el conteo (vendidos, recibidos, ajustados). */
  cambiaron: Array<{ item: ItemConteo; contado: number }>;
  valorDiferencia: number;
};

function costo(i: ItemConteo) {
  return typeof i.costoUnidad === "number" && Number.isFinite(i.costoUnidad) ? i.costoUnidad : 0;
}

/** Foto de lo que entraba en el conteo al empezar: {id: [cantidad, estado]}. */
export type FotoConteo = Record<string, [number, string]>;

export function fotoInicial(items: ItemConteo[], alcance: AlcanceConteo): FotoConteo {
  const foto: FotoConteo = {};
  for (const i of items) if (entraEnConteo(i, alcance)) foto[i.id] = [i.cantidad, i.estado];
  return foto;
}

export function compararConteo(input: {
  items: ItemConteo[];
  lineas: LineaConteo[];
  alcance: AlcanceConteo;
  inicio: string;
  /** Si está, "cambió al contar" = distinta cantidad o estado que al empezar (más preciso que la fecha). */
  foto?: FotoConteo | null;
}): ResultadoConteo {
  const inicio = new Date(input.inicio).getTime();
  const foto = input.foto ?? null;
  const cambio = (i: ItemConteo) => {
    if (foto) {
      const antes = foto[i.id];
      if (!antes) return entraEnConteo(i, input.alcance); // entró a la tienda mientras se contaba
      return antes[0] !== i.cantidad || normal(antes[1]) !== normal(i.estado);
    }
    const t = new Date(i.ultimaActualizacion).getTime();
    return Number.isFinite(t) && Number.isFinite(inicio) && t > inicio;
  };
  const porId = new Map(input.items.map((i) => [i.id, i]));
  const vivas = lineasVivas(input.lineas);
  const esperados = input.items.filter((i) => entraEnConteo(i, input.alcance));

  // SKU que hay que revisar: lo esperado + todo lo contado.
  const skus = new Map<string, { nombre: string }>();
  for (const i of esperados) skus.set(normalCodigo(i.sku), { nombre: i.nombre });
  for (const l of vivas) {
    if (l.tipo === "Sin registro") continue;
    const i = l.itemId ? porId.get(l.itemId) : undefined;
    const sku = normalCodigo(l.sku || i?.sku);
    if (sku && !skus.has(sku)) skus.set(sku, { nombre: i?.nombre ?? "" });
  }

  const resultado: ResultadoConteo = { coinciden: [], faltan: [], sobran: [], sinRegistro: [], cambiaron: [], valorDiferencia: 0 };
  const cambiaronIds = new Set<string>();

  skus.forEach(({ nombre }, sku) => {
    const delSku = input.items.filter((i) => normalCodigo(i.sku) === sku);
    const espSku = esperados.filter((i) => normalCodigo(i.sku) === sku);
    const lineasSku = vivas.filter((l) => normalCodigo(l.sku || (l.itemId ? porId.get(l.itemId)?.sku : "")) === sku);
    const comoLote = delSku.some((i) => !esUnidad(i)) && !lineasSku.some((l) => l.tipo === "Unidad");

    // Lo que cambió después de empezar no se compara.
    const cambiados = delSku.filter(cambio);
    for (const i of cambiados) {
      if (cambiaronIds.has(i.id)) continue;
      cambiaronIds.add(i.id);
      resultado.cambiaron.push({ item: i, contado: lineasSku.filter((l) => l.itemId === i.id).reduce((s, l) => s + l.cantidad, 0) });
    }

    if (comoLote) {
      const vigentes = espSku.filter((i) => !cambiaronIds.has(i.id));
      if (cambiados.length) return; // con un lote que se movió durante el conteo, la cantidad no se puede comparar
      const sistema = vigentes.reduce((s, i) => s + i.cantidad, 0);
      const contado = lineasSku.reduce((s, l) => s + l.cantidad, 0);
      const registros = [...delSku].sort((a, b) => a.ultimaActualizacion.localeCompare(b.ultimaActualizacion));
      const ref = vigentes[0] ?? registros[0];
      const fila: FilaConteo = { sku, nombre: nombre || ref?.nombre || "", tipo: "lote", sistema, contado, faltan: [], sobran: [], sinIdentificar: 0, sinIdentificarDeMas: 0, registros, valor: (contado - sistema) * (ref ? costo(ref) : 0) };
      if (contado === sistema) resultado.coinciden.push(fila);
      else (contado < sistema ? resultado.faltan : resultado.sobran).push(fila);
      return;
    }

    const contadasIds = new Set(lineasSku.filter((l) => l.tipo === "Unidad" && l.itemId).map((l) => l.itemId as string));
    const sinIdentificar = lineasSku.filter((l) => l.tipo === "Sin identificar").reduce((s, l) => s + l.cantidad, 0);
    const espVigentes = espSku.filter((i) => !cambiaronIds.has(i.id));
    let noVistas = espVigentes.filter((i) => !contadasIds.has(i.id));
    const cubiertas = Math.min(sinIdentificar, noVistas.length);
    noVistas = noVistas.slice(cubiertas); // un "sin identificar" cubre una que no se escaneó
    const sobranUnidades = Array.from(contadasIds)
      .map((id) => porId.get(id))
      .filter((i): i is ItemConteo => Boolean(i && !cambiaronIds.has(i.id) && !espVigentes.some((e) => e.id === i.id)));
    const sinIdentificarDeMas = sinIdentificar - cubiertas;
    const sistema = espVigentes.length;
    const contado = Array.from(contadasIds).filter((id) => !cambiaronIds.has(id)).length + sinIdentificar;
    const ref = espVigentes[0] ?? delSku[0];
    const fila: FilaConteo = {
      sku,
      nombre: nombre || ref?.nombre || "",
      tipo: "unidad",
      sistema,
      contado,
      faltan: noVistas,
      sobran: sobranUnidades,
      sinIdentificar,
      sinIdentificarDeMas,
      registros: delSku,
      valor: -noVistas.reduce((s, i) => s + costo(i), 0) + sobranUnidades.reduce((s, i) => s + costo(i), 0) + sinIdentificarDeMas * (ref ? costo(ref) : 0),
    };
    if (!noVistas.length && !sobranUnidades.length && sinIdentificarDeMas <= 0) resultado.coinciden.push(fila);
    else {
      if (noVistas.length) resultado.faltan.push(fila);
      if (sobranUnidades.length || sinIdentificarDeMas > 0) resultado.sobran.push(fila);
    }
  });

  const sinRegistro = new Map<string, { codigo: string; cantidad: number; contadoPor: string }>();
  for (const l of vivas.filter((x) => x.tipo === "Sin registro")) {
    const k = normalCodigo(l.codigo);
    const actual = sinRegistro.get(k);
    if (actual) actual.cantidad += l.cantidad;
    else sinRegistro.set(k, { codigo: k, cantidad: l.cantidad, contadoPor: l.contadoPor });
  }
  resultado.sinRegistro = Array.from(sinRegistro.values());
  const ordenar = (a: FilaConteo, b: FilaConteo) => a.sku.localeCompare(b.sku);
  resultado.coinciden.sort(ordenar);
  resultado.faltan.sort(ordenar);
  resultado.sobran.sort(ordenar);
  const unicas = new Set<FilaConteo>([...resultado.faltan, ...resultado.sobran]);
  resultado.valorDiferencia = Array.from(unicas).reduce((s, f) => s + f.valor, 0);
  return resultado;
}

/** Cuántas lecturas lleva. */
export function totalContado(lineas: LineaConteo[]) {
  return lineasVivas(lineas).reduce((s, l) => s + l.cantidad, 0);
}

/** Cómo va un SKU: cuántas le faltan por encontrar y cuántas hay de más. */
export type ProgresoFila = { fila: FilaConteo; falta: number; sobra: number };

export type ProgresoConteo = {
  /** Lo que el sistema tiene en el conteo (sin lo que cambió mientras se contaba). */
  total: number;
  /** De eso, cuánto ya se encontró. */
  encontrados: number;
  porContar: ProgresoFila[];
  deMas: ProgresoFila[];
  completos: number;
};

/** El avance mientras se cuenta ("23 de 50"), a partir de la comparación. */
export function progresoConteo(r: ResultadoConteo): ProgresoConteo {
  const filas = Array.from(new Set<FilaConteo>([...r.coinciden, ...r.faltan, ...r.sobran]));
  const salida: ProgresoConteo = { total: 0, encontrados: 0, porContar: [], deMas: [], completos: 0 };
  for (const fila of filas) {
    const falta = fila.tipo === "lote" ? Math.max(0, fila.sistema - fila.contado) : fila.faltan.length;
    const sobra = fila.tipo === "lote" ? Math.max(0, fila.contado - fila.sistema) : fila.sobran.length + fila.sinIdentificarDeMas;
    salida.total += fila.sistema;
    salida.encontrados += fila.sistema - falta;
    if (falta) salida.porContar.push({ fila, falta, sobra });
    if (sobra) salida.deMas.push({ fila, falta, sobra });
    if (!falta && !sobra) salida.completos++;
  }
  const orden = (a: ProgresoFila, b: ProgresoFila) => a.fila.sku.localeCompare(b.fila.sku);
  salida.porContar.sort(orden);
  salida.deMas.sort(orden);
  return salida;
}

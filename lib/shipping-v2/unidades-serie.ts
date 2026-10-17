// Unidades individuales, series y lotes (punto 10b de la auditoría Shipping V2,
// decisiones del dueño del 16 y 17-oct-2026). Solo reglas, sin red.
//
// El modelo, en palabras de la tienda:
// - El PRODUCTO es "qué es" (Dell Latitude 5420 i5 16 GB). Se identifica por su
//   SKU limpio (LAP-000500), que es el que va en la etiqueta y las publicaciones.
// - Cada REGISTRO de Shipping Items es "lo que se compró y viaja", con SUS
//   costos (proveedor, flete, arancel, mejoras). Varios registros pueden
//   compartir el mismo SKU: son las unidades o los lotes de ese producto.
//   Los costos nunca se suman ni se promedian entre registros.
// - UNIDAD (equipos): 1 registro = 1 equipo, que se distingue por su SERIE (la
//   del fabricante, o una interna SG00000001 si no tiene). Cantidad siempre 1.
// - LOTE (cables, cargadores, accesorios…): 1 registro = lo que llegó de una
//   misma compra, con su cantidad. Al vender se toma primero el más antiguo.
//
// Así lo hacen los sistemas profesionales (Odoo, Lightspeed, RepairDesk): el
// producto por un lado y el número de serie de cada unidad por otro.

import { normalizarTexto } from "./importar-lineas";

// ─── Unidad o lote ───────────────────────────────────────────────────────────

export type Seguimiento = "Unidad" | "Lote";

/** Decisión C (a) del 17-oct: equipos uno por uno; todo lo demás, por lote. */
export const CATEGORIAS_POR_UNIDAD = [
  "Laptop",
  "Desktop",
  "All in One",
  "Monitor",
  "Consola",
  "Tablet",
  "Celular",
  "Impresora",
  "Tarjeta gráfica",
  "Mainboard",
] as const;

const POR_UNIDAD = new Set(CATEGORIAS_POR_UNIDAD.map((c) => normalizarTexto(c)));

/** Lo que propone el sistema para una categoría (el empleado puede cambiarlo). */
export function seguimientoPorCategoria(categoria?: string | null): Seguimiento {
  return POR_UNIDAD.has(normalizarTexto(categoria)) ? "Unidad" : "Lote";
}

/** El seguimiento real de un registro: el elegido al registrar o el de su categoría. */
export function seguimientoDe(item: { seguimiento?: string | null; categoria?: string | null }): Seguimiento {
  const elegido = normalizarTexto(item.seguimiento);
  if (elegido === "unidad") return "Unidad";
  if (elegido === "lote") return "Lote";
  return seguimientoPorCategoria(item.categoria);
}

// ─── Series ──────────────────────────────────────────────────────────────────

/** Serie interna: SG + 8 números, sin guion, para no confundirla con un SKU (AAA-000000). */
export const PATRON_SERIE_INTERNA = /^SG\d{8}$/;

/**
 * Deja la serie como se guarda y se compara: mayúsculas, sin espacios y sin el
 * "S/N" que a veces se copia de la etiqueta del fabricante.
 */
export function normalizarSerie(valor?: string | null): string {
  return String(valor ?? "")
    .toUpperCase()
    .replace(/^\s*(S\s*\/\s*N|SN|SERIAL|SERIE|SERVICE\s*TAG)\s*[:#-]?\s*/, "")
    .replace(/\s+/g, "")
    .trim();
}

export function esSerieInterna(serie?: string | null): boolean {
  return PATRON_SERIE_INTERNA.test(normalizarSerie(serie));
}

/** La siguiente serie interna libre, a partir de las que ya existen. */
export function siguienteSerieInterna(existentes: Iterable<string | null | undefined>): string {
  let mayor = 0;
  for (const s of existentes) {
    const n = normalizarSerie(s);
    if (PATRON_SERIE_INTERNA.test(n)) mayor = Math.max(mayor, Number(n.slice(2)));
  }
  return `SG${String(mayor + 1).padStart(8, "0")}`;
}

export type EvaluacionSerie = { ok: true; serie: string } | { ok: false; motivo: string };

/**
 * ¿Sirve esta serie para esta unidad? Una serie no se repite en todo el
 * inventario (`otras`: serie normalizada → SKU de la unidad que ya la tiene).
 */
export function evaluarSerie(valor: string | null | undefined, otras: Map<string, string>): EvaluacionSerie {
  const serie = normalizarSerie(valor);
  if (!serie) return { ok: false, motivo: "Escribe o escanea la serie." };
  if (serie.length < 4) return { ok: false, motivo: "La serie es demasiado corta." };
  if (serie.length > 40) return { ok: false, motivo: "La serie es demasiado larga." };
  if (!/^[A-Z0-9][A-Z0-9./-]*$/.test(serie)) return { ok: false, motivo: "La serie solo lleva letras, números, punto, guion o barra." };
  if (/^[A-Z]{2,4}-\d{6}$/.test(serie)) return { ok: false, motivo: "Eso parece un SKU, no una serie." };
  const duenio = otras.get(serie);
  if (duenio) return { ok: false, motivo: `Esa serie ya la tiene ${duenio}.` };
  return { ok: true, serie };
}

/** Cómo se nombra una unidad en pantallas y documentos: "LAP-000500 · S/N 7HX2KQ3". */
export function nombreUnidad(sku: string, serie?: string | null): string {
  const s = normalizarSerie(serie);
  return s ? `${sku} · S/N ${s}` : sku;
}

/** La serie abreviada para chips y listas cortas: "…KQ3". */
export function serieCorta(serie?: string | null, cuantos = 3): string {
  const s = normalizarSerie(serie);
  return s.length > cuantos + 1 ? `…${s.slice(-cuantos)}` : s;
}

/**
 * Lo que lleva el código de barras de la etiqueta: la serie en una unidad que
 * ya la tiene; el SKU en un lote (o en una unidad que todavía no tiene serie).
 */
export function valorCodigoBarras(item: { sku: string; numeroSerie?: string | null; seguimiento?: string | null; categoria?: string | null }) {
  const serie = normalizarSerie(item.numeroSerie);
  if (seguimientoDe(item) === "Unidad" && serie) return { valor: serie, texto: `S/N ${serie}` };
  return { valor: item.sku, texto: item.sku };
}

/**
 * Una unidad (equipo) que ya está en la tienda necesita su serie para
 * venderse: es lo que dice la factura y lo que se escanea en caja.
 */
export function faltaSerieParaVender(item: { seguimiento?: string | null; categoria?: string | null; numeroSerie?: string | null }): boolean {
  return seguimientoDe(item) === "Unidad" && !normalizarSerie(item.numeroSerie);
}

// ─── ¿Ya existe este producto? ───────────────────────────────────────────────

export type DatosParaComparar = {
  sku?: string;
  nombre?: string;
  categoria?: string;
  marca?: string;
  condicion?: string;
  /** Número de parte del fabricante o código de barras ("SKU proveedor"). */
  numeroParte?: string;
  modelo?: string;
  cpuModelo?: string;
  ram?: string;
  almacenamiento?: string;
};

export type Coincidencia = { sku: string; nivel: "igual" | "parecido"; motivos: string[] };

function clave(valor?: string | null) {
  return normalizarTexto(valor).replace(/[^a-z0-9]/g, "");
}

function palabras(valor?: string | null): Set<string> {
  return new Set(normalizarTexto(valor).split(/[^a-z0-9]+/).filter((p) => p.length >= 2));
}

/**
 * Compara lo que se está registrando con un producto que ya existe.
 *
 * - "igual" por número de parte o código de barras idéntico.
 * - "igual" en equipos: mismo modelo, procesador, RAM, disco y condición.
 *   Si cambia uno (8 GB contra 16 GB), NO es el mismo producto.
 * - "parecido": misma categoría y marca y nombres muy parecidos. Solo sugiere.
 * El sistema nunca une solo: el empleado confirma "Usar este producto" o "Es otro".
 */
export function compararProducto(nuevo: DatosParaComparar, existente: DatosParaComparar): Coincidencia | null {
  const sku = existente.sku ?? "";
  if (!sku) return null;
  const mismaCategoria = clave(nuevo.categoria) && clave(nuevo.categoria) === clave(existente.categoria);
  const mismaCondicion = clave(nuevo.condicion) === clave(existente.condicion);

  const parteNueva = clave(nuevo.numeroParte);
  if (parteNueva.length >= 4 && parteNueva === clave(existente.numeroParte) && mismaCondicion) {
    return { sku, nivel: "igual", motivos: [`número de parte ${nuevo.numeroParte?.trim()}`] };
  }

  if (mismaCategoria && seguimientoPorCategoria(nuevo.categoria) === "Unidad") {
    const campos: Array<[keyof DatosParaComparar, string]> = [
      ["modelo", "modelo"],
      ["cpuModelo", "procesador"],
      ["ram", "RAM"],
      ["almacenamiento", "disco"],
    ];
    const conDato = campos.filter(([k]) => clave(nuevo[k] as string));
    // Al menos modelo + 2 datos de configuración para afirmar "igual".
    if (clave(nuevo.modelo) && conDato.length >= 3 && mismaCondicion
      && conDato.every(([k]) => clave(nuevo[k] as string) === clave(existente[k] as string))) {
      return { sku, nivel: "igual", motivos: [...conDato.map(([k, etiqueta]) => `${etiqueta} ${(nuevo[k] as string).trim()}`), `condición ${nuevo.condicion ?? ""}`.trim()] };
    }
  }

  if (mismaCategoria && clave(nuevo.marca) === clave(existente.marca)) {
    const a = palabras(nuevo.nombre);
    const b = palabras(existente.nombre);
    if (a.size && b.size) {
      let comunes = 0;
      for (const p of a) if (b.has(p)) comunes++;
      const parecido = comunes / Math.max(a.size, b.size);
      if (parecido >= 0.6) return { sku, nivel: "parecido", motivos: ["nombre parecido"] };
    }
  }
  return null;
}

/**
 * Las mejores coincidencias para lo que se está registrando, una por SKU,
 * primero las "igual". `descartados` = SKU que el empleado ya marcó "Es otro".
 */
export function buscarCoincidencias(
  nuevo: DatosParaComparar,
  existentes: DatosParaComparar[],
  opciones: { descartados?: Iterable<string>; maximo?: number } = {}
): Coincidencia[] {
  const fuera = new Set(Array.from(opciones.descartados ?? [], (s) => s.toUpperCase()));
  const porSku = new Map<string, Coincidencia>();
  for (const e of existentes) {
    if (!e.sku || fuera.has(e.sku.toUpperCase())) continue;
    const c = compararProducto(nuevo, e);
    if (!c) continue;
    const previa = porSku.get(c.sku);
    if (!previa || (previa.nivel === "parecido" && c.nivel === "igual")) porSku.set(c.sku, c);
  }
  return [...porSku.values()]
    .sort((x, y) => (x.nivel === y.nivel ? x.sku.localeCompare(y.sku) : x.nivel === "igual" ? -1 : 1))
    .slice(0, opciones.maximo ?? 5);
}

// ─── Lotes: primero sale el más antiguo ──────────────────────────────────────

export type LoteDisponible = { id: string; fecha: string; libres: number };

export type TomaDeLotes = { ok: true; tomas: Array<{ id: string; cantidad: number }> } | { ok: false; motivo: string };

/**
 * De qué lotes sale una venta de `cantidad` unidades (decisión C2 del 17-oct):
 * del más antiguo con unidades libres, y si no alcanza, del siguiente.
 */
export function tomarDeLotes(lotes: LoteDisponible[], cantidad: number): TomaDeLotes {
  const pedir = Math.floor(cantidad);
  if (!(pedir > 0)) return { ok: false, motivo: "La cantidad debe ser mayor que 0." };
  const ordenados = lotes
    .filter((l) => l.libres > 0)
    .sort((a, b) => (a.fecha === b.fecha ? a.id.localeCompare(b.id) : a.fecha.localeCompare(b.fecha)));
  const total = ordenados.reduce((s, l) => s + l.libres, 0);
  if (total < pedir) return { ok: false, motivo: `Solo hay ${total} unidad(es) libres.` };
  const tomas: Array<{ id: string; cantidad: number }> = [];
  let falta = pedir;
  for (const l of ordenados) {
    if (falta === 0) break;
    const t = Math.min(l.libres, falta);
    tomas.push({ id: l.id, cantidad: t });
    falta -= t;
  }
  return { ok: true, tomas };
}

// Pagos de logística (auditoría Shipping V2, punto 9c · 13-oct-2026).
//
// ─── Regla de negocio (dueño) ───────────────────────────────────────────────
// · Cada caja, o cada artículo que viaja solo, tiene tres gastos:
//     Flete   → a Laarbox o la empresa logística (un proveedor logístico).
//     Arancel → a la SENAE.
//     Otros   → gastos operativos de cualquier índole (sin destinatario fijo).
// · Cada gasto se paga y se registra por separado, con su respaldo, y crea un
//   egreso en Finanzas con la categoría "Logística Shipping".
// · "Otros" puede tener varios pagos: se van sumando.
// · Manda lo pagado: el valor del gasto en la caja (o el artículo) pasa a ser
//   lo pagado en total, y se vuelve a repartir entre los artículos.
// · Las cajas anteriores quedan pendientes: el dueño registra cada pago.
// · (14-oct, fase 1) El monto de un gasto NUNCA se escribe a mano: nunca se
//   sabe el flete antes de pagarlo. Nace del pago, y se registra en un solo
//   lugar: la caja, o la ficha del artículo que viaja solo.
//
// Módulo puro: sin red.

function normalize(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export const CONCEPTOS_LOGISTICA = ["Flete", "Arancel", "Otros"] as const;
export type ConceptoLogistica = (typeof CONCEPTOS_LOGISTICA)[number];
export type ConceptoPago = "Compra" | ConceptoLogistica;

export const CATEGORIA_FINANZAS_LOGISTICA = "Logística Shipping";
export const CATEGORIA_FINANZAS_COMPRA = "Compra Proveedor Shipping";
export const PAGADO_A_ARANCEL = "SENAE";

/** Concepto de un pago; los anteriores al punto 9c (vacío) son compras. */
export function conceptoDePago(concepto?: string | null): ConceptoPago {
  const c = normalize(concepto);
  if (c === "flete") return "Flete";
  if (c === "arancel") return "Arancel";
  if (c === "otros") return "Otros";
  return "Compra";
}

export function esConceptoLogistica(concepto?: string | null): concepto is ConceptoLogistica {
  return conceptoDePago(concepto) !== "Compra";
}

export function categoriaFinanzasDe(concepto?: string | null): string {
  return esConceptoLogistica(concepto) ? CATEGORIA_FINANZAS_LOGISTICA : CATEGORIA_FINANZAS_COMPRA;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

export type SituacionGasto = {
  /** Valor escrito en la caja o el artículo (null = sin escribir). */
  valor: number | null;
  /** Suma de los pagos registrados (no anulados) de este gasto. */
  pagado: number;
  /** Lo que falta registrar (0 si no falta). */
  pendiente: number;
  estado: "pagado" | "falta" | "sin-valor";
};

export function situacionGasto(valor: number | null | undefined, pagado: number): SituacionGasto {
  const v = typeof valor === "number" && Number.isFinite(valor) ? redondear(valor) : null;
  const p = redondear(pagado || 0);
  const pendiente = v !== null && v > p ? redondear(v - p) : 0;
  if (pendiente > 0) return { valor: v, pagado: p, pendiente, estado: "falta" };
  if (p > 0) return { valor: v, pagado: p, pendiente: 0, estado: "pagado" };
  return { valor: v, pagado: p, pendiente: 0, estado: "sin-valor" };
}

/** Manda lo pagado: el valor del gasto queda igual al total pagado. */
export function valorTrasPago(pagadoAntes: number, monto: number): number {
  return redondear((pagadoAntes || 0) + monto);
}

export type EntradaPagoLogistica = {
  concepto?: string | null;
  packingId?: string | null;
  itemId?: string | null;
  monto?: number | null;
  proveedorId?: string | null;
  pagadoA?: string | null;
  fechaPagoReal?: string | null;
  metodoPago?: string | null;
  cuentaOrigen?: string | null;
};

/** Devuelve el error o null. */
export function validarPagoLogistica(e: EntradaPagoLogistica): string | null {
  if (!esConceptoLogistica(e.concepto)) return "Elige qué se pagó: Flete, Arancel u Otros.";
  const destinos = [e.packingId, e.itemId].filter((x) => String(x ?? "").trim()).length;
  if (destinos !== 1) return "El pago debe ser de una caja o de un artículo que viaja solo.";
  if (!(typeof e.monto === "number" && Number.isFinite(e.monto) && e.monto > 0)) return "El monto debe ser mayor a 0.";
  if (conceptoDePago(e.concepto) === "Flete" && !String(e.proveedorId ?? "").trim()) return "Elige a qué empresa logística se pagó el flete.";
  if (!String(e.fechaPagoReal ?? "").trim()) return "Indica la fecha del pago.";
  const metodo = normalize(e.metodoPago);
  if (!metodo || metodo === "no aplica") return "Indica el método de pago.";
  const cuenta = normalize(e.cuentaOrigen);
  if (!cuenta || cuenta === "no aplica") return "Elige la cuenta.";
  return null;
}

/** A quién se pagó, para mostrar y guardar en "Pagado a". */
export function pagadoAPor(concepto: ConceptoLogistica, pagadoA?: string | null): string {
  if (concepto === "Arancel") return PAGADO_A_ARANCEL;
  return String(pagadoA ?? "").trim();
}

/**
 * Qué le falta a una caja o artículo suelto en sus costos de traerlo:
 *  · falta    → valor escrito antes (cajas anteriores) que no tiene pago.
 *  · sinFlete → ya viaja o ya llegó y no tiene flete pagado. Solo cajas y
 *               artículos del extranjero (lo local a veces no paga flete).
 *               Las cajas con el ciclo cerrado no avisan.
 */
export type PendienteLogistica = { falta: number; sinFlete: boolean; pagado: number };

const ESPERAN_FLETE = new Set(["en transito", "recibido", "en revision", "con novedad"]);

export function pendienteLogistica(fila: {
  tipo: "caja" | "suelto";
  estadoLogistico?: string | null;
  aplicaArancel: boolean;
  flete: SituacionGasto;
  arancel: SituacionGasto;
  otros: SituacionGasto;
}): PendienteLogistica {
  const falta = redondear(fila.flete.pendiente + (fila.aplicaArancel ? fila.arancel.pendiente : 0) + fila.otros.pendiente);
  const pagado = redondear(fila.flete.pagado + fila.arancel.pagado + fila.otros.pagado);
  const puedeAvisar = fila.tipo === "caja" || fila.aplicaArancel;
  const sinFlete = puedeAvisar && ESPERAN_FLETE.has(normalize(fila.estadoLogistico)) && fila.flete.pagado <= 0 && fila.flete.pendiente <= 0;
  return { falta, sinFlete, pagado };
}

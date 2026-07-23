// Cálculo del total de un recibo. SIN IVA: el precio de cada línea es el
// precio final; el total es la suma directa (precio × cantidad − descuento).
// Sin "server-only": la UI lo usa para la vista previa.

import type { LineaRecibo } from "./types";

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function totalRecibo(lineas: LineaRecibo[]): number {
  return round2(lineas.reduce((s, l) => s + (l.cantidad * l.precioUnitario - l.descuento), 0));
}

export function totalLinea(l: LineaRecibo): number {
  return round2(l.cantidad * l.precioUnitario - l.descuento);
}

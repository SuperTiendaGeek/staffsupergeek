// Reglas de negocio PURAS de las reservas (sin Airtable, testeables). El resto
// del módulo (Airtable, movimientos, inventario) se apoya en estas funciones.

import type { PlazoReserva } from "./types";

export const PLAZOS_VALIDOS: PlazoReserva[] = [7, 15, 30];

export const UMBRAL_PRECIO  = 50;  // precio de venta > este valor exige el abono alto
export const ABONO_MIN_ALTO = 20;  // mínimo si precio de venta > $50
export const ABONO_MIN_BAJO = 5;   // mínimo si precio de venta <= $50

const r2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

/** Abono mínimo para reservar según el precio de venta. Nunca mayor al precio
 *  (un ítem baratísimo no puede exigir un mínimo superior a su valor). */
export function abonoMinimo(precioVenta: number): number {
  const base = precioVenta > UMBRAL_PRECIO ? ABONO_MIN_ALTO : ABONO_MIN_BAJO;
  return Math.min(base, r2(precioVenta));
}

/** Fecha límite = fecha de reserva + plazo (días calendario), a medianoche. */
export function fechaLimiteReserva(fechaReserva: Date, plazoDias: number): Date {
  const d = new Date(fechaReserva.getFullYear(), fechaReserva.getMonth(), fechaReserva.getDate());
  d.setDate(d.getDate() + plazoDias);
  return d;
}

/** Días calendario que faltan para el vencimiento (negativo si ya venció). */
export function diasRestantesReserva(fechaLimite: Date, hoy: Date): number {
  const a = new Date(fechaLimite.getFullYear(), fechaLimite.getMonth(), fechaLimite.getDate());
  const b = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

/** ¿La reserva ya venció? El día del límite todavía es válido. */
export function reservaVencida(fechaLimite: Date, hoy: Date): boolean {
  return diasRestantesReserva(fechaLimite, hoy) < 0;
}

/** Saldo pendiente por pagar (nunca negativo). */
export function saldoPendiente(precioVenta: number, totalAbonado: number): number {
  return r2(Math.max(0, precioVenta - totalAbonado));
}

/** ¿Está totalmente pagada? Habilita convertirla en venta/factura. */
export function pagoCompleto(precioVenta: number, totalAbonado: number): boolean {
  return totalAbonado + 0.005 >= precioVenta;
}

/** Valida un abono. `totalAbonadoPrevio` = suma de abonos ya registrados. El
 *  PRIMER abono debe alcanzar el mínimo; los siguientes admiten cualquier monto
 *  positivo sin exceder el saldo. Devuelve mensaje de error o null si es válido. */
export function validarAbono(monto: number, precioVenta: number, totalAbonadoPrevio: number): string | null {
  if (!(monto > 0)) return "El abono debe ser mayor a 0";
  if (r2(totalAbonadoPrevio + monto) > r2(precioVenta) + 0.005) return "El abono supera el saldo pendiente";
  if (totalAbonadoPrevio <= 0.005) {
    const min = abonoMinimo(precioVenta);
    if (monto + 0.005 < min) return `El primer abono debe ser al menos $${min.toFixed(2)}`;
  }
  return null;
}

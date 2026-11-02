// Saldo a favor del cliente — reglas PURAS (auditoría Técnicos y Operaciones,
// punto 13B). Sin servidor, sin Airtable, sin reloj propio.
//
// Un solo saldo por cliente, con movimientos (tabla "Saldo a Favor"):
//   · Generado  (+) el cliente dejó dinero de más y se le guarda: una cuenta
//                   que quedó con sobrante, una reserva liberada, una nota de
//                   crédito. Cada uno vence a los 6 meses.
//   · Usado     (−) se aplicó como pago a otra cuenta o compra.
//   · Devuelto  (−) se le devolvió el dinero (sale de una cuenta real).
//   · Vencido   (−) pasaron los 6 meses sin usarlo.
//   · Ajuste    (−) corrección a la baja autorizada.
// Lo que se usa se descuenta primero de lo que vence antes (como un lote de
// inventario: primero lo más viejo). Así, cuando algo vence, se sabe cuánto
// de ESE monto quedaba.
//
// Modelo profesional: "store credit" de Lightspeed/Shopify y el crédito del
// cliente de NetSuite (Customer Deposit / Credit Memo + Customer Refund).
//
// Ejemplo real (Elvis Castañeda): reservó un mini PC y abonó $20; la reserva
// venció y se liberó el 9-oct → Generado $20, vence 9-abr-2027. Si el 15-nov
// compra un cargador de $35 y usa su saldo: Usado $20, paga $15 en efectivo.

import { fechaDeCaducidad, yaVencio, MESES_DE_VIGENCIA } from "@/lib/facturacion/notaCredito/caducidad";

export { MESES_DE_VIGENCIA };

export const TOLERANCIA = 0.01;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type TipoMovimientoSaldo = "Generado" | "Usado" | "Devuelto" | "Vencido" | "Ajuste";
export const TIPOS_QUE_RESTAN: ReadonlySet<TipoMovimientoSaldo> = new Set(["Usado", "Devuelto", "Vencido", "Ajuste"]);

export type MovimientoSaldo = {
  id: string;
  tipo: TipoMovimientoSaldo;
  /** Siempre positivo; el tipo dice si suma o resta. */
  monto: number;
  /** ISO. */
  fecha: string;
  /** "aaaa-mm-dd", solo en Generado. */
  vence?: string | null;
  estado: "Vigente" | "Anulado" | string;
};

export type LoteSaldo = {
  id: string;
  fecha: string;
  vence: string;
  original: number;
  restante: number;
};

export type SaldoCliente = {
  /** Lo que el cliente puede usar hoy (los lotes vencidos no cuentan). */
  disponible: number;
  /** Lotes con algo por usar, del que vence primero al último. */
  lotes: LoteSaldo[];
  /** Lotes vencidos que todavía no tienen su movimiento "Vencido". */
  porVencer: LoteSaldo[];
  /** Fecha del vencimiento más próximo entre lo disponible ("" si no hay). */
  proximoVence: string;
};

/** Vence a los 6 meses de generarse (misma regla que el crédito de las NC). */
export function venceDe(fechaGenerado: string): string {
  return fechaDeCaducidad(fechaGenerado);
}

/**
 * Saldo de un cliente a partir de sus movimientos.
 * `hoy` = "aaaa-mm-dd" (Ecuador). Un lote vence al día siguiente de su fecha.
 */
export function calcularSaldoCliente(movimientos: readonly MovimientoSaldo[], hoy: string): SaldoCliente {
  const vigentes = movimientos.filter((m) => m.estado !== "Anulado" && m.monto > 0);
  const lotes: LoteSaldo[] = vigentes
    .filter((m) => m.tipo === "Generado")
    .map((m) => {
      const vence = (m.vence && m.vence.trim()) || venceDe(m.fecha);
      return { id: m.id, fecha: m.fecha, vence, original: r2(m.monto), restante: r2(m.monto) };
    })
    .sort((a, b) => (a.vence === b.vence ? a.fecha.localeCompare(b.fecha) : a.vence.localeCompare(b.vence)));

  const consumos = vigentes
    .filter((m) => TIPOS_QUE_RESTAN.has(m.tipo as TipoMovimientoSaldo))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  for (const c of consumos) {
    let pendiente = r2(c.monto);
    for (const l of lotes) {
      if (pendiente <= TOLERANCIA) break;
      const toma = Math.min(l.restante, pendiente);
      l.restante = r2(l.restante - toma);
      pendiente = r2(pendiente - toma);
    }
  }

  const conSaldo = lotes.filter((l) => l.restante > TOLERANCIA);
  const porVencer = conSaldo.filter((l) => yaVencio(l.vence, hoy));
  const vivos = conSaldo.filter((l) => !yaVencio(l.vence, hoy));
  return {
    disponible: r2(vivos.reduce((s, l) => s + l.restante, 0)),
    lotes: vivos,
    porVencer,
    proximoVence: vivos[0]?.vence ?? "",
  };
}

// ─── Validaciones de las tres acciones ───────────────────────────────────────

export type Rechazo = { ok: false; motivo: string };
const NO = (motivo: string): Rechazo => ({ ok: false, motivo });
const dinero = (n: number) => `$${r2(n).toFixed(2)}`;

/**
 * "Pasar a saldo a favor": TODO lo que le sobra a la cuenta pasa al saldo del
 * cliente y la cuenta queda en $0. Lo puede hacer cualquier empleado.
 * Ej.: OR000xxx cobró $100 y la reparación costó $80 → Generado $20.
 */
export function validarPasarASaldo(input: { aFavorCuenta: number; clienteId: string | null }): { ok: true; monto: number } | Rechazo {
  if (!input.clienteId) return NO("La cuenta no tiene cliente: no se puede guardar el saldo a favor de nadie.");
  const monto = r2(input.aFavorCuenta);
  if (!(monto > TOLERANCIA)) return NO("A esta cuenta no le sobra dinero.");
  return { ok: true, monto };
}

/**
 * "Devolver": lo que sobra se le devuelve al cliente desde una cuenta real.
 * Solo el administrador. La cuenta, el método y el número los valida
 * validarSolicitudReembolso (la misma regla del reembolso de las NC).
 */
export function validarDevolverSobrante(input: { aFavorCuenta: number; esAdministrador: boolean }): { ok: true; monto: number } | Rechazo {
  if (!input.esAdministrador) return NO("Solo el administrador puede devolver dinero al cliente.");
  const monto = r2(input.aFavorCuenta);
  if (!(monto > TOLERANCIA)) return NO("A esta cuenta no le sobra dinero.");
  return { ok: true, monto };
}

/**
 * Usar el saldo a favor como pago: nunca más de lo que el cliente tiene ni de
 * lo que falta cobrar en esa cuenta.
 * Ej.: tiene $20, la cuenta debe $35 → puede usar hasta $20 y el resto se
 * cobra con otro método. Tiene $50 y debe $35 → usa $35, le quedan $15.
 */
export function validarUsoDeSaldo(input: { monto: number; disponible: number; porCobrar: number }): { ok: true; monto: number } | Rechazo {
  const monto = r2(input.monto);
  if (!(monto > TOLERANCIA)) return NO("El monto a usar del saldo a favor debe ser mayor a $0.");
  if (monto > r2(input.disponible) + TOLERANCIA) return NO(`El cliente tiene ${dinero(input.disponible)} de saldo a favor; no alcanza para ${dinero(monto)}.`);
  if (monto > r2(input.porCobrar) + TOLERANCIA) return NO(`En esta cuenta falta cobrar ${dinero(input.porCobrar)}; no se puede usar más que eso.`);
  return { ok: true, monto };
}

/** Lo máximo que se puede usar del saldo en una cuenta (para proponerlo en pantalla). */
export function maximoUsable(disponible: number, porCobrar: number): number {
  return r2(Math.max(0, Math.min(disponible, porCobrar)));
}

// ─── Textos ──────────────────────────────────────────────────────────────────

export const METODO_SALDO_A_FAVOR = "Saldo a favor";

/** Observación del abono negativo que deja la cuenta en $0. */
export function observacionAbonoSalida(tipo: "Generado" | "Devuelto", detalle?: string): string {
  const base = tipo === "Generado" ? "Pasado a saldo a favor del cliente" : "Devuelto al cliente";
  return detalle ? `${base} · ${detalle}` : base;
}

export function descripcionMovimiento(m: { tipo: TipoMovimientoSaldo; monto: number; cliente: string; referencia?: string }): string {
  const ref = m.referencia ? ` · ${m.referencia}` : "";
  return `${m.tipo} ${dinero(m.monto)} · ${m.cliente || "sin cliente"}${ref}`;
}

// ─── Migración: fecha en que se liberó una reserva ──────────────────────────

/**
 * Lee del historial de la reserva cuándo se liberó (la última línea que dice
 * "Liberada" o "Saldo a favor"). Las líneas están en hora de Ecuador:
 * "[2026-10-09 11:30] Claude (autorizado por el dueño): Liberada por …".
 * Devuelve ISO (UTC) o "" si no hay una línea legible.
 */
export function fechaLiberacionDeHistorial(historial: string): string {
  const lineas = historial.split(/\r?\n/).filter((l) => /liberad|saldo a favor/i.test(l));
  const ultima = lineas[lineas.length - 1] ?? "";
  const m = /^\[(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})\]/.exec(ultima.trim());
  if (!m) return "";
  return new Date(`${m[1]}T${m[2]}:${m[3]}:00-05:00`).toISOString();
}

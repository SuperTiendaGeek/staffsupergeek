// Plazos de retiro de un pedido especial — regla PURA (auditoría ops, punto
// 10C-3b · 13-nov-2026). Con prueba en __tests__/retiro.test.ts.
//
// Decisiones del dueño (12-nov, Diseno_Fase3_Pedidos.md 18 y 20; maquetas 5a–5c):
//   · Desde "¡Llegó a la tienda!" el cliente tiene 7 días. Si después de ese
//     plazo aún debe algo, se suma UNA vez un recargo del 10 % de lo que
//     debe (no del total). Lo pone el sistema solo; un administrador lo
//     quita con motivo y entonces no se vuelve a poner.
//   · Se guarda hasta 3 meses desde la llegada. Después, un administrador lo
//     "Libera": el artículo pasa a la tienda y TODO lo pagado a saldo a favor
//     (con o sin saldo pendiente).
//
// Ejemplo: Kindle $160, pagó $80, llegó el mar 17-nov →
//   "Retíralo antes del mar 24-nov"; el 24-nov se suma $8 (10 % de $80);
//   se guarda hasta el mié 17-feb; desde el 18-feb aparece en "Por liberar".

import { textoDia } from "./seguimiento";

export const DIAS_PARA_RETIRAR = 7;
export const MESES_GUARDADO = 3;
export const PORCENTAJE_RECARGO = 0.1;
/**
 * El recargo automático solo corre para lo que llegó DESDE este día: los
 * pedidos que llegaron antes se aceptaron sin estas condiciones y no se
 * les suma nada de golpe el día que se sube el proceso.
 */
export const RECARGO_VIGENTE_DESDE = "2026-11-14";

/** ¿A este pedido le corre el recargo? (llegó con la regla vigente). */
export function aplicaRecargo(llegoEn: string | null | undefined): boolean {
  return !!llegoEn && llegoEn.slice(0, 10) >= RECARGO_VIGENTE_DESDE;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const usd = (n: number) => `$${r2(n).toFixed(2).replace(/\.00$/, "")}`;

/** "aaaa-mm-dd" + días. */
function sumarDias(fecha: string, dias: number): string {
  return new Date(Date.parse(`${fecha}T12:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);
}

/** "aaaa-mm-dd" + meses (el 31-ene + 1 mes = 28/29-feb). */
function sumarMeses(fecha: string, meses: number): string {
  const [a, m, d] = fecha.split("-").map(Number);
  const objetivo = new Date(Date.UTC(a, m - 1 + meses, 1, 12));
  const ultimo = new Date(Date.UTC(objetivo.getUTCFullYear(), objetivo.getUTCMonth() + 1, 0, 12)).getUTCDate();
  objetivo.setUTCDate(Math.min(d, ultimo));
  return objetivo.toISOString().slice(0, 10);
}

/** "aaaa-mm-dd" de Ecuador desde un instante. */
export function hoyEcuador(ahora: Date = new Date()): string {
  return new Date(ahora.getTime() - 5 * 3_600_000).toISOString().slice(0, 10);
}

export type Plazos = {
  /** Día de la llegada (Ecuador). */
  llego: string;
  /** Desde este día corre el recargo ("Retíralo antes del…"). */
  recargoDesde: string;
  /** Último día que se guarda; desde el siguiente se puede liberar. */
  guardadoHasta: string;
};

/** null si el pedido no ha llegado. `llegoEn` puede ser ISO o "aaaa-mm-dd". */
export function plazosDeRetiro(llegoEn: string | null | undefined): Plazos | null {
  const t = llegoEn ? Date.parse(llegoEn.length === 10 ? `${llegoEn}T12:00:00Z` : llegoEn) : NaN;
  if (!Number.isFinite(t)) return null;
  const llego = llegoEn!.length === 10 ? llegoEn! : hoyEcuador(new Date(t));
  return { llego, recargoDesde: sumarDias(llego, DIAS_PARA_RETIRAR), guardadoHasta: sumarMeses(llego, MESES_GUARDADO) };
}

/** Cuánto recargo poner HOY (0 = nada). Una sola vez, sobre el saldo pendiente. */
export function recargoQueCorresponde(input: {
  estado: string;
  llegoEn: string | null | undefined;
  hoy: string;
  /** Lo que el cliente debe (sin recargo). */
  saldoPendiente: number;
  recargoActual: number;
  /** Un administrador lo quitó: no se vuelve a poner. */
  recargoQuitado: boolean;
}): number {
  if (input.estado !== "Aceptado" || input.recargoQuitado || input.recargoActual > 0.005) return 0;
  const p = plazosDeRetiro(input.llegoEn);
  if (!p || input.hoy < p.recargoDesde || !aplicaRecargo(p.llego)) return 0;
  const saldo = r2(input.saldoPendiente);
  return saldo > 0.005 ? r2(saldo * PORCENTAJE_RECARGO) : 0;
}

/** ¿Pasó el plazo máximo? (aparece en "Por liberar"). */
export function debeLiberarse(input: { estado: string; llegoEn: string | null | undefined; hoy: string }): boolean {
  if (input.estado !== "Aceptado") return false;
  const p = plazosDeRetiro(input.llegoEn);
  return !!p && input.hoy > p.guardadoHasta;
}

/** Lo que lee el cliente debajo de "¡Llegó a la tienda!" (maqueta 5c). */
export function avisoDeRetiro(input: { llegoEn: string | null | undefined; hoy: string; recargo: number; debe: number }): { aviso: string; detalle: string } | null {
  const p = plazosDeRetiro(input.llegoEn);
  if (!p) return null;
  if (input.recargo > 0.005) {
    return { aviso: "Pasó el plazo de 7 días", detalle: `Se sumó un recargo de ${usd(input.recargo)}. Te lo guardamos hasta el ${textoDia(p.guardadoHasta)}.` };
  }
  if (input.hoy < p.recargoDesde) {
    return {
      aviso: `Retíralo antes del ${textoDia(p.recargoDesde)}`,
      detalle: input.debe > 0.005 && aplicaRecargo(p.llego) ? "Después se suma un recargo del 10 % de lo que falta." : `Te lo guardamos hasta el ${textoDia(p.guardadoHasta)}.`,
    };
  }
  return { aviso: "Tu pedido te espera", detalle: `Te lo guardamos hasta el ${textoDia(p.guardadoHasta)}.` };
}

/** Línea interna (pantalla del pedido): "Llegó mar 17-nov · recargo desde mar 24-nov · plazo máximo mié 17-feb". */
export function textoPlazos(llegoEn: string | null | undefined): string {
  const p = plazosDeRetiro(llegoEn);
  if (!p) return "";
  const recargo = aplicaRecargo(p.llego) ? ` · recargo desde ${textoDia(p.recargoDesde)}` : " · sin recargo (llegó antes de la regla)";
  return `Llegó ${textoDia(p.llego)}${recargo} · plazo máximo ${textoDia(p.guardadoHasta)}`;
}

/** "Recargo quitado": queda escrito quién, cuándo y por qué. */
export function notaRecargoQuitado(motivo: string, usuario: string, monto: number, ahora: Date = new Date()): string {
  return `${hoyEcuador(ahora)} · ${usuario} quitó ${usd(monto)}: ${motivo.trim()}`;
}

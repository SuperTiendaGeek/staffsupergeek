import type { CuentaFinanciera } from "@/types/finanzas";

// Fase 20.3 §3.4/§4.2 — mientras las Cuentas Financieras no tengan Fecha de
// Corte (el día real de go-live, docs/DISENO_FASE20_1_FUNDACION.md §6 paso
// 9), cualquier Movimiento Interno se rechazaría por "saldo insuficiente"
// ($0 en todas las cuentas) — técnicamente correcto pero engañoso. Este
// error distingue explícitamente ese caso del de un saldo insuficiente real
// post-go-live, compartido entre el depósito de caja y la acreditación.
export const MENSAJE_PRE_GO_LIVE =
  "El sistema contable aún no está en vivo — falta cargar Saldo Inicial y Fecha de Corte en Cuentas Financieras (ver docs/DISENO_FASE20_1_FUNDACION.md §6, paso 9). Los movimientos internos no pueden registrarse hasta ese día.";

export class PreGoLiveError extends Error {
  readonly code = "PRE_GO_LIVE" as const;

  constructor() {
    super(MENSAJE_PRE_GO_LIVE);
    this.name = "PreGoLiveError";
  }
}

export function algunaCuentaSinFechaCorte(cuentas: Array<CuentaFinanciera | null>): boolean {
  return cuentas.some((cuenta) => !cuenta || !cuenta.fechaCorte);
}

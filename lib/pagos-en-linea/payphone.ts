import "server-only";

// Adaptador PayPhone — Cajita de Pagos box v2.0 (docs.payphone.app/cajita-de-pagos).
//   - La cajita se dibuja en NUESTRA página con un token que, por diseño de
//     PayPhone, viaja al navegador; PayPhone solo la acepta en el dominio
//     registrado (staff.supertiendageek.com). Nunca se mandan otras claves.
//   - Al pagar, PayPhone vuelve a /api/publico/payphone/retorno con `id` y
//     `clientTransactionId`, y el SERVIDOR confirma con "Confirm" antes de 5
//     minutos (si no, PayPhone reversa el cobro).

import type { ConfigPasarela } from "./config";
import { desgloseIva, type RespuestaPayPhone } from "./reglas";

const URL_CONFIRM = "https://paymentbox.payphonetodoesposible.com/api/confirm";
export const CAJITA_CSS = "https://cdn.payphonetodoesposible.com/box/v2.0/payphone-payment-box.css";
export const CAJITA_JS = "https://cdn.payphonetodoesposible.com/box/v2.0/payphone-payment-box.js";

/** Lo que el navegador necesita para dibujar la cajita (montos en centavos). */
export type ParametrosCajita = {
  token: string;
  storeId: string;
  clientTransactionId: string;
  amount: number;
  amountWithTax: number;
  tax: number;
  amountWithoutTax: number;
  service: number;
  tip: number;
  currency: "USD";
  reference: string;
  lang: "es";
  defaultMethod: "card";
  timeZone: number;
  css: string;
  js: string;
};

export function parametrosCajita(c: ConfigPasarela, intento: { codigo: string; monto: number; referencia: string }): ParametrosCajita {
  const d = desgloseIva(intento.monto);
  return {
    token: c.token,
    storeId: c.storeId,
    clientTransactionId: intento.codigo,
    amount: d.totalC,
    amountWithTax: d.baseC,
    tax: d.ivaC,
    amountWithoutTax: 0,
    service: 0,
    tip: 0,
    currency: "USD",
    reference: intento.referencia.slice(0, 100),
    lang: "es",
    defaultMethod: "card",
    timeZone: -5,
    css: CAJITA_CSS,
    js: CAJITA_JS,
  };
}

/**
 * Pregunta a PayPhone cómo quedó el pago. Lanza solo si no hubo respuesta
 * (red caída, 5xx): en ese caso el pago queda "sin respuesta" y se reintenta.
 */
export async function confirmarEnPayPhone(c: ConfigPasarela, id: number, codigo: string): Promise<RespuestaPayPhone> {
  const controlador = new AbortController();
  const corte = setTimeout(() => controlador.abort(), 20_000);
  try {
    const res = await fetch(URL_CONFIRM, {
      method: "POST",
      headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id, clientTxId: codigo }),
      cache: "no-store",
      signal: controlador.signal,
    });
    const datos = (await res.json().catch(() => ({}))) as RespuestaPayPhone & { errorCode?: number };
    if (res.status >= 500) throw new Error(`PayPhone respondió ${res.status}.`);
    // 4xx: respuesta válida sin aprobación (las reglas la tratan como desconocida/rechazada).
    return datos;
  } finally {
    clearTimeout(corte);
  }
}

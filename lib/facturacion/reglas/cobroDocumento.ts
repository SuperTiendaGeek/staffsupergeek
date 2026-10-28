/**
 * Cobro y documento cuando se emite DESDE una orden u operación — reglas
 * PURAS, sin "server-only": la pantalla de emisión usa los mismos mensajes
 * que el servidor (mismo criterio que reglas/identificacion.ts).
 *
 * Auditoría Técnicos y Operaciones, punto 1 (27-oct-2026). Antes, al emitir,
 * el dinero que faltaba se cobraba "dentro" del documento y quedaba como un
 * movimiento suelto en Finanzas, sin abono y casi siempre sin cuenta (caso
 * OR000510). Decisiones del dueño:
 *
 *   · La factura o el recibo NO son el pago (NetSuite, Odoo, Lightspeed).
 *     La cuenta se paga con abonos — mismo formulario, cuenta destino
 *     obligatoria — ANTES de emitir. Nunca se emite debiendo (no hay crédito).
 *   · El documento tiene dos bloques (Lightspeed/RepairDesk/Odoo PdV):
 *       - "cuenta": las líneas de la orden/operación, BLOQUEADAS. Si alguien
 *         las cambia al emitir, el servidor lo rechaza (caso OR000423: el SSD
 *         de $40 salió a $20 sin rastro).
 *       - "adicional": lo que el cliente compra de paso al retirar su equipo.
 *         Vive solo en el documento y se cobra en ese momento, con método de
 *         pago y cuenta.
 *   · Con documento vigente no se aceptan abonos nuevos, salvo saldo real.
 */

import type { DetalleFactura, Pago } from "../types/factura";
import { mensajeCobrosInvalidos } from "@/lib/cobros/metodos";

const TOLERANCIA = 0.01;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const dinero = (n: number) => `$${round2(n).toFixed(2)}`;

// ─── Saldo de la cuenta antes de emitir ──────────────────────────────────────

/** Lo que falta cobrar de la cuenta: total − abonos vigentes. */
export function saldoPorCobrar(totalCuenta: number, abonosVigentes: Array<{ monto: number }>): number {
  return round2(totalCuenta - abonosVigentes.reduce((s, a) => s + (a.monto || 0), 0));
}

/**
 * Mensaje que bloquea la emisión si la cuenta no está exactamente pagada, o
 * null si se puede emitir. `etiqueta` es "orden" u "operación".
 */
export function mensajeCuentaNoPagada(saldo: number, etiqueta: string): string | null {
  if (saldo > TOLERANCIA) {
    return `Falta cobrar ${dinero(saldo)} de esta ${etiqueta}. Registra el pago (abono) con su método y cuenta antes de emitir el documento.`;
  }
  if (saldo < -TOLERANCIA) {
    return `El cliente tiene ${dinero(-saldo)} pagados de más en esta ${etiqueta}. Resuelve ese saldo a favor (devolver o anular el abono que sobra) antes de emitir el documento.`;
  }
  return null;
}

// ─── Bloque "cuenta": no se puede cambiar al emitir ──────────────────────────

/** Total final (con IVA y descuento) de una línea de factura. */
export function totalFinalLinea(d: Pick<DetalleFactura, "precioTotalSinImpuesto" | "impuestos">): number {
  return round2(d.precioTotalSinImpuesto + d.impuestos.reduce((s, i) => s + (i.valor || 0), 0));
}

export function esLineaAdicional(d: { bloque?: string }): boolean {
  return d.bloque === "adicional";
}

export type LineaComparable = {
  descripcion: string;
  cantidad: number;
  /** Total final de la línea (lo que paga el cliente por ella). */
  total: number;
  shippingItemId?: string;
  productoDigitalId?: string;
};

const claveLinea = (l: LineaComparable) =>
  l.shippingItemId ? `item:${l.shippingItemId}` : l.productoDigitalId ? `digital:${l.productoDigitalId}` : `texto:${l.descripcion.trim().toLowerCase()}`;

/**
 * Compara las líneas de la cuenta que envía la pantalla con las que arma el
 * servidor. Devuelve null si son las mismas, o un mensaje con lo que cambió.
 * Se comparan cantidad y total final por línea (tolerancia de 2 centavos por
 * redondeo de IVA); el orden de las líneas no importa.
 */
export function mensajeBloqueCuentaModificado(enviadas: LineaComparable[], esperadas: LineaComparable[]): string | null {
  const pendientes = [...esperadas];
  const cambios: string[] = [];

  for (const e of enviadas) {
    const i = pendientes.findIndex((p) => claveLinea(p) === claveLinea(e));
    if (i === -1) {
      cambios.push(`"${e.descripcion}" no está en la cuenta (si es una venta de paso, va en "Venta adicional")`);
      continue;
    }
    const p = pendientes.splice(i, 1)[0];
    if (p.cantidad !== e.cantidad) cambios.push(`"${p.descripcion}": cantidad ${p.cantidad} → ${e.cantidad}`);
    else if (Math.abs(round2(p.total - e.total)) > 0.02) cambios.push(`"${p.descripcion}": ${dinero(p.total)} → ${dinero(e.total)}`);
  }
  for (const p of pendientes) cambios.push(`falta "${p.descripcion}" (${dinero(p.total)})`);

  if (cambios.length === 0) return null;
  return (
    "Las líneas que vienen de la orden no se pueden cambiar al emitir: " +
    cambios.join("; ") +
    ". Si hace falta un descuento, lo registra el administrador en la orden, con su motivo."
  );
}

// ─── Bloque "adicional": se cobra al emitir, con método y cuenta ─────────────

export type PagoAdicionalInput = { metodoPago?: string; total: number; referencia?: string };

/** Valida los pagos de la venta adicional. null = todo bien. */
export function mensajePagosAdicionalesInvalidos(pagos: PagoAdicionalInput[], totalAdicional: number): string | null {
  const total = round2(totalAdicional);
  if (total <= TOLERANCIA) {
    return pagos.length > 0 ? "Hay pagos de venta adicional pero no hay líneas de venta adicional." : null;
  }
  // Mismas reglas que cualquier cobro (catálogo único, punto 7).
  return mensajeCobrosInvalidos(pagos, total, "la venta adicional");
}

/**
 * Pago SRI de una línea de cobro de la venta adicional (ya validada).
 * `codigoSri` traduce el método al código SRI (en el servidor:
 * MAPA_METODO_PAGO_SRI de gancho/config.ts — el código SRI es un dato fiscal
 * que se DEDUCE del método, nunca lo elige el empleado).
 */
export function pagoSriDeAdicional(p: PagoAdicionalInput, codigoSri: (metodo: string) => string): Pago {
  const metodo = p.metodoPago?.trim() ?? "";
  return {
    formaPago: codigoSri(metodo),
    total: round2(p.total),
    origenPago: "adicional",
    metodoPago: metodo,
    referencia: p.referencia?.trim() || undefined,
  };
}

/**
 * Formas de pago del documento: los abonos de la cuenta (los arma el
 * SERVIDOR desde Airtable, nunca la pantalla) + los cobros de la venta
 * adicional.
 */
export function componerPagosDocumento(
  pagosDeAbonos: Pago[],
  adicionales: PagoAdicionalInput[],
  codigoSri: (metodo: string) => string
): Pago[] {
  return [...pagosDeAbonos.filter((p) => p.origenPago === "abono"), ...adicionales.map((p) => pagoSriDeAdicional(p, codigoSri))];
}

// ─── Abonos nuevos cuando ya hay documento ───────────────────────────────────

/**
 * Con un documento vigente la cuenta ya está cobrada y documentada: un abono
 * nuevo solo se acepta si queda saldo real, y nunca por más de ese saldo.
 * Sin documento, cualquier abono es válido (anticipos).
 */
export function mensajeAbonoNoPermitido(input: {
  documentoVigente: string | null; // p. ej. "el recibo REC-000067"; null si no hay
  saldo: number;
  monto: number;
  etiqueta: string; // "orden" | "operación"
}): string | null {
  if (!input.documentoVigente) return null;
  const saldo = round2(input.saldo);
  if (saldo <= TOLERANCIA) {
    return `Esta ${input.etiqueta} ya tiene ${input.documentoVigente} y no debe nada. No se registra el abono: el ingreso entraría dos veces en Finanzas.`;
  }
  if (round2(input.monto) - saldo > TOLERANCIA) {
    return `Esta ${input.etiqueta} ya tiene ${input.documentoVigente} y solo debe ${dinero(saldo)}. El abono no puede ser mayor.`;
  }
  return null;
}

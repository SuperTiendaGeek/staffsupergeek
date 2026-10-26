/**
 * Nota de crédito con destino "Reembolso": reglas puras, sin red.
 *
 * ─── Qué es ──────────────────────────────────────────────────────────────────
 *
 * Hasta octubre de 2026 una nota de crédito solo podía terminar en crédito
 * interno ("Cambio de equipo" o "Saldo a favor"). Cuando el cliente devuelve
 * un equipo y quiere su dinero —y no volverá a comprar— hacía falta un tercer
 * destino: devolverle el dinero de verdad.
 *
 * Ante el SRI no cambia NADA. El destino no viaja en el XML: la nota de
 * crédito que se firma y se envía es idéntica con cualquiera de los tres
 * destinos (ver __tests__/notaCredito.reembolso.test.ts). El destino solo
 * decide qué se registra en Finanzas:
 *
 *   Cambio / Saldo a favor   Egreso "Devolución" SIN cuenta  → no sale dinero,
 *                            el crédito queda vigente (6 meses) a favor del cliente
 *   Reembolso                Egreso "Devolución" CON cuenta  → sale el dinero de
 *                            esa cuenta, y el crédito queda en 0 ("Consumido")
 *
 * Un solo asiento hace las dos cosas: revierte el ingreso de la venta y saca
 * el dinero de la cuenta. Es el mismo criterio que ya usa la anulación de un
 * recibo interno (lib/finanzas/puentes/recibo.ts → revertirPuenteRecibo).
 *
 *     Venta de $450                        Ingreso  +450
 *     Devuelve la laptop, reembolso $420   Egreso   −420  (sale de la cuenta)
 *                                          ─────────────
 *                                          neto       30  = dinero que se quedó ✓
 *
 * Ver docs/DISENO_NC_REVERSA_Y_CADUCIDAD.md §6.
 */

import type { MetodoMovimiento } from "@/types/finanzas";

/** Cómo se le devuelve el dinero al cliente. Valores existentes del select "Método". */
export const METODOS_REEMBOLSO = [
  "Transferencia bancaria",
  "Efectivo",
  "Depósito",
  "DeUna",
  "PayPal",
  "Otro",
] as const satisfies readonly MetodoMovimiento[];

export type MetodoReembolso = (typeof METODOS_REEMBOLSO)[number];

/** Métodos que dejan un número que se puede buscar en el banco: se exige la referencia. */
const METODOS_CON_REFERENCIA: ReadonlySet<string> = new Set(["Transferencia bancaria", "Depósito", "DeUna", "PayPal"]);

/**
 * Lo que se guarda del reembolso. Viaja en "Líneas JSON" de la nota de
 * crédito (clave `reembolso`), junto a las líneas: así queda constancia de
 * qué cuenta y qué referencia se usaron aunque el asiento falle y haya que
 * revisarlo después. NUNCA se serializa al XML del SRI.
 */
export type DatosReembolso = {
  cuentaOrigenId:     string;
  cuentaOrigenNombre: string;
  metodo:             MetodoReembolso;
  /** Número de transferencia, comprobante, etc. */
  transaccionId?:     string;
};

/** Lo que llega del formulario, antes de validar. */
export type SolicitudReembolso = {
  cuentaOrigenId?: unknown;
  metodo?:         unknown;
  transaccionId?:  unknown;
};

type CuentaParaReembolso = { id: string; nombre: string; tipo: string; activa: boolean };

/**
 * ¿Puede salir un reembolso de esta cuenta?
 *
 * No de una cuenta de Tránsito (es dinero que la pasarela todavía no
 * entregó) ni de una Tarjeta de Crédito (no se le devuelve dinero a un
 * cliente pagando con la tarjeta de la tienda). Tampoco de una inactiva.
 */
export function cuentaPermiteReembolso(cuenta: CuentaParaReembolso): boolean {
  if (!cuenta.activa) return false;
  return cuenta.tipo !== "Tránsito" && cuenta.tipo !== "Tarjeta de Crédito";
}

export function esMetodoReembolso(valor: unknown): valor is MetodoReembolso {
  return typeof valor === "string" && (METODOS_REEMBOLSO as readonly string[]).includes(valor);
}

/**
 * Valida la solicitud contra la cuenta ya leída de Airtable. Devuelve los
 * datos listos para guardar, o el motivo del rechazo para mostrar tal cual.
 *
 * Corre ANTES de enviar nada al SRI: una nota de crédito autorizada ya no se
 * puede deshacer, así que un dato del reembolso mal puesto tiene que frenar
 * la emisión, no aparecer como error contable después.
 */
export function validarSolicitudReembolso(
  solicitud: SolicitudReembolso | undefined | null,
  cuenta: CuentaParaReembolso | null
): { ok: true; datos: DatosReembolso } | { ok: false; motivo: string } {
  if (!solicitud || typeof solicitud !== "object") {
    return { ok: false, motivo: "Indica de qué cuenta sale el reembolso y cómo se le devuelve el dinero al cliente." };
  }
  const cuentaOrigenId = typeof solicitud.cuentaOrigenId === "string" ? solicitud.cuentaOrigenId.trim() : "";
  if (!cuentaOrigenId) return { ok: false, motivo: "Elige la cuenta de la que sale el reembolso." };
  if (!cuenta || cuenta.id !== cuentaOrigenId) return { ok: false, motivo: "La cuenta elegida para el reembolso no existe." };
  if (!cuenta.activa) return { ok: false, motivo: `La cuenta "${cuenta.nombre}" está inactiva.` };
  if (!cuentaPermiteReembolso(cuenta)) {
    return { ok: false, motivo: `No se puede reembolsar desde "${cuenta.nombre}" (cuenta de tipo ${cuenta.tipo}). Elige la cuenta de donde realmente sale el dinero.` };
  }

  if (!esMetodoReembolso(solicitud.metodo)) {
    return { ok: false, motivo: "Indica cómo se le devuelve el dinero al cliente (transferencia, efectivo…)." };
  }
  const metodo = solicitud.metodo;

  const transaccionId = typeof solicitud.transaccionId === "string" ? solicitud.transaccionId.trim() : "";
  if (METODOS_CON_REFERENCIA.has(metodo) && !transaccionId) {
    return { ok: false, motivo: `Escribe el número de la ${metodo.toLowerCase()} para que el reembolso quede respaldado.` };
  }
  if (transaccionId.length > 100) return { ok: false, motivo: "La referencia del reembolso es demasiado larga." };

  return {
    ok: true,
    datos: {
      cuentaOrigenId,
      cuentaOrigenNombre: cuenta.nombre,
      metodo,
      ...(transaccionId ? { transaccionId } : {}),
    },
  };
}

/**
 * Lee los datos del reembolso guardados en "Líneas JSON". Devuelve null si
 * no hay o están incompletos: el puente contable, en ese caso, NO escribe
 * nada —sin saber de qué cuenta salió el dinero no se puede asentar.
 */
export function leerReembolsoDeLineasJson(lineasJson: string | undefined | null): DatosReembolso | null {
  if (!lineasJson) return null;
  let raw: unknown;
  try { raw = JSON.parse(lineasJson); } catch { return null; }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = (raw as { reembolso?: unknown }).reembolso;
  if (!r || typeof r !== "object") return null;
  const d = r as Record<string, unknown>;
  const cuentaOrigenId = typeof d.cuentaOrigenId === "string" ? d.cuentaOrigenId.trim() : "";
  if (!cuentaOrigenId || !esMetodoReembolso(d.metodo)) return null;
  return {
    cuentaOrigenId,
    cuentaOrigenNombre: typeof d.cuentaOrigenNombre === "string" ? d.cuentaOrigenNombre : "",
    metodo:             d.metodo,
    ...(typeof d.transaccionId === "string" && d.transaccionId.trim() ? { transaccionId: d.transaccionId.trim() } : {}),
  };
}

/** Texto de la observación del movimiento. Que se entienda leyéndolo en Finanzas. */
export function observacionReembolso(p: {
  numeroNotaCredito: string;
  numeroFacturaModificada?: string;
  datos: DatosReembolso;
}): string {
  const factura = p.numeroFacturaModificada ? ` (factura ${p.numeroFacturaModificada})` : "";
  const ref = p.datos.transaccionId ? `, referencia ${p.datos.transaccionId}` : "";
  const cuenta = p.datos.cuentaOrigenNombre ? ` desde ${p.datos.cuentaOrigenNombre}` : "";
  return (
    `Reembolso al cliente por la nota de crédito ${p.numeroNotaCredito}${factura}: ` +
    `${p.datos.metodo.toLowerCase()}${cuenta}${ref}. Revierte el ingreso de la venta y sale de caja; ` +
    `el cliente no queda con saldo a favor.`
  );
}

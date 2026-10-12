// Pagos a proveedor (auditoría Shipping V2, punto 9 · 12-oct-2026).
//
// ─── Regla de negocio (dueño) ───────────────────────────────────────────────
// · Ningún proveedor da crédito: si una compra está registrada, YA SE PAGÓ.
//   Lo que puede faltar es el RESPALDO (fecha, cuenta, comprobante o número
//   de transacción). Al subirlo se crea el egreso en Finanzas.
// · Por eso no existe "Por pagar": existe "Falta respaldo".
// · El pago NUNCA se mezcla con la logística. "Pendiente de pago" y "Pagado"
//   dejaron de ser etapas del Estado Item (lo que viajaba en el estado se
//   perdía al entrar a una caja, ponerle rastreo o llegar: F-8d). La
//   situación del pago sale SOLO de los pagos registrados en Shipping Pagos.
// · Las compras anteriores al 12-oct sin respaldo se registraron como
//   "pago histórico": quedan pagadas, sin egreso en Finanzas y sin pedir
//   soporte (decisión del dueño).
// · Que falte el respaldo no bloquea nada (dar de baja, vender, viajar…).
//
// Módulo puro: sin red.

function normalize(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export type SituacionPago = "sin-pago" | "falta-respaldo" | "pago-en-curso" | "pagado";

/**
 * ¿Qué pasa con el pago al proveedor de este artículo?
 *  sin-pago       → no hubo compra (regalo, reajuste, despiece…).
 *  falta-respaldo → compra pagada sin respaldo registrado.
 *  pago-en-curso  → está en un pago que se está registrando (no Pagado aún).
 *  pagado         → está en un pago Pagado (con respaldo o histórico).
 */
export function situacionPago(a: {
  requierePago?: boolean | null;
  esRegalo?: boolean | null;
  pagos?: Array<{ estado?: string | null }>;
}): SituacionPago {
  if (a.requierePago !== true || a.esRegalo === true) return "sin-pago";
  const vivos = (a.pagos ?? []).filter((p) => normalize(p.estado) !== "anulado");
  if (vivos.some((p) => normalize(p.estado) === "pagado")) return "pagado";
  if (vivos.length) return "pago-en-curso";
  return "falta-respaldo";
}

export const ETIQUETA_SITUACION_PAGO: Record<SituacionPago, string> = {
  "sin-pago": "No requiere pago",
  "falta-respaldo": "Falta respaldo",
  "pago-en-curso": "Respaldo en registro",
  pagado: "Pagado",
};

/** Etapas de pago que ya no son Estado Item (punto 9). */
export const ESTADOS_DE_PAGO_RETIRADOS: readonly string[] = ["Pendiente de pago", "Pagado"];

/** Estado con el que nace TODA compra que todavía no llega (antes "Pendiente de pago"). */
export const ESTADO_INICIAL_EN_CAMINO = "Registrado";

/**
 * Para datos anteriores: si el estado era una etapa de pago, el artículo
 * vuelve a la etapa logística equivalente ("Registrado"). Lo demás no cambia.
 */
export function estadoSinEtapaDePago(estado?: string | null): string | null {
  const n = normalize(estado);
  if (n === "pendiente de pago" || n === "pagado") return ESTADO_INICIAL_EN_CAMINO;
  return null;
}

// ─── Pago histórico ─────────────────────────────────────────────────────────
// Se reconoce por: Estado Pago = Pagado, integración con Finanzas = "No aplica"
// y sin movimiento financiero. Ningún otro camino crea pagos así.

export const OBSERVACION_PAGO_HISTORICO =
  "Pago histórico: compra pagada antes de registrar respaldos en el portal (auditoría Shipping V2, punto 9, 12-oct-2026). Sin egreso en Finanzas por decisión del dueño.";

export function esPagoHistorico(pago: {
  estadoPago?: string | null;
  estadoIntegracionFinanzas?: string | null;
  movimientoFinanzasIds?: string[] | null;
}): boolean {
  return (
    normalize(pago.estadoPago) === "pagado" &&
    normalize(pago.estadoIntegracionFinanzas) === "no aplica" &&
    !(pago.movimientoFinanzasIds ?? []).length
  );
}

// ─── Lista "Falta respaldo" ─────────────────────────────────────────────────

export type ItemParaRespaldo = {
  requierePago?: boolean | null;
  esRegalo?: boolean | null;
  cancelado?: boolean;
  /** El tipo de compra exige proveedor y no lo tiene. */
  faltaProveedor?: boolean;
  /** Está en algún pago que no se anuló. */
  enPagoVivo?: boolean;
};

/** ¿Aparece en Pagos → "Falta respaldo"? */
export function faltaRespaldo(a: ItemParaRespaldo): boolean {
  if (a.requierePago !== true || a.esRegalo === true) return false;
  if (a.cancelado) return false;
  if (a.faltaProveedor) return false;
  return a.enPagoVivo !== true;
}

// ─── Respaldo al registrar una compra ───────────────────────────────────────

export type RespaldoAlRegistrar = {
  fechaPagoReal?: string | null;
  metodoPago?: string | null;
  cuentaOrigen?: string | null;
  transaccionId?: string | null;
  comprobanteUrl?: string | null;
};

/** Mismos requisitos que "Registrar pago" en Pagos: fecha, método y cuenta. Devuelve el error o null. */
export function validarRespaldo(r: RespaldoAlRegistrar | null | undefined): string | null {
  if (!r) return "Faltan los datos del respaldo.";
  if (!String(r.fechaPagoReal ?? "").trim()) return "Indica la fecha del pago.";
  const metodo = normalize(r.metodoPago);
  if (!metodo || metodo === "no aplica") return "Indica el método de pago.";
  const cuenta = normalize(r.cuentaOrigen);
  if (!cuenta || cuenta === "no aplica") return "Indica la cuenta de donde salió el pago.";
  // Punto 9b: el comprobante es opcional (queda "Sin comprobante").
  return null;
}

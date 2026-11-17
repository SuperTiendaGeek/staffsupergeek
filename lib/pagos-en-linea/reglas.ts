// Pagos en línea (caja de cobro: PayPhone, luego DeUna) — reglas PURAS
// (punto 23 / 10D de la auditoría, 17-nov-2026). Sin Airtable ni React: se
// usan en el servidor y en la pantalla del cliente. Prueba en
// __tests__/reglas.test.ts.
//
// Decisiones del dueño (claude/Diseno_10D_Pagos_en_linea.md):
//   - El cliente paga el MISMO valor por transferencia que con tarjeta; SUPER
//     GEEK absorbe la comisión. El abono es el monto bruto.
//   - Finanzas recibe el neto exacto: PayPhone con tarjeta cobra 5 % + IVA 15 %
//     de esa comisión = 5,75 %, redondeado al centavo (ventas reales: $990 →
//     $56,93; $590 → $33,93). Con saldo PayPhone no hay comisión.
//   - El IVA del pago se declara como en las facturas: el precio incluye 15 %.
//   - El cliente puede pagar el anticipo o todo; con el pedido en camino o en
//     la tienda, lo que falta.
//   - Anti-duplicado (opción A): un mismo ID de transacción se aplica una sola
//     vez; si algo cambió mientras pagaba, el dinero se guarda y el personal
//     revisa ("En revisión"), nunca se confirma otra opción en silencio.

export type Pasarela = "PayPhone" | "DeUna";
export type Ambiente = "Prueba" | "Producción";
export type EstadoPago = "Abierto" | "Aprobado" | "Aplicado" | "Rechazado" | "Vencido" | "En revisión";
export type ParaPago = "Confirmar" | "Todo" | "Lo que falta";
export type MedioPago = "Tarjeta de crédito" | "Tarjeta de débito" | "Saldo PayPhone" | "DeUna";
export type OrigenPago = "Pedido" | "Orden" | "Enlace de pago";

export const ESTADOS_PAGO: readonly EstadoPago[] = ["Abierto", "Aprobado", "Aplicado", "Rechazado", "Vencido", "En revisión"];
export const PARA_PAGO: readonly ParaPago[] = ["Confirmar", "Todo", "Lo que falta"];

/** La cajita de PayPhone vence a los 10 minutos de abrirse. */
export const MINUTOS_VIGENCIA_CAJITA = 10;
/** El precio incluye IVA 15 % (igual que las facturas). */
export const TASA_IVA = 0.15;

/**
 * Tarifa de cada pasarela y medio, en centésimas de punto porcentual
 * (575 = 5,75 %). PayPhone tarjeta = 5 % + IVA 15 % de la comisión.
 * DeUna: por definir cuando se construya (hoy 0).
 * Más adelante se podrá editar desde Administrar → Pagos en línea.
 */
export const TARIFAS: Record<Pasarela, Record<MedioPago, number>> = {
  PayPhone: { "Tarjeta de crédito": 575, "Tarjeta de débito": 575, "Saldo PayPhone": 0, DeUna: 0 },
  DeUna: { "Tarjeta de crédito": 0, "Tarjeta de débito": 0, "Saldo PayPhone": 0, DeUna: 0 },
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const aCentavos = (monto: number): number => Math.round((Number(monto) || 0) * 100 + Number.EPSILON);
export const deCentavos = (c: number): number => c / 100;
const usd = (n: number) => `$${r2(n).toFixed(2)}`;

/** PL-000001 (lo mismo que calcula la fórmula "Código" de Airtable). */
export function codigoPago(numero: number): string {
  return `PL-${String(Math.max(0, Math.trunc(numero))).padStart(6, "0")}`;
}
export const CODIGO_PAGO_REGEX = /^PL-\d{6,}$/;

// ─── ¿Cuánto se puede pagar? ────────────────────────────────────────────────

/** Lo mínimo que la caja necesita saber de la cuenta (sale de la vista del cliente). */
export type CuentaParaCobro = {
  /** Fase del enlace: por_pagar (eligió, falta pagar) · confirmado (en camino o en la tienda). */
  fase: string;
  pago: { total: number; pagado: number; paraConfirmar: number; faltaParaConfirmar: number; faltaTotal: number };
};

export type OpcionDePago = { para: ParaPago; monto: number };

/**
 * Lo que el cliente puede pagar en línea ahora. Ej. (Camila, $410):
 *   por pagar → [Confirmar $205, Todo $410]; con $100 o menos solo "Confirmar".
 *   confirmado con $205 pendientes → [Lo que falta $205].
 */
export function opcionesDePago(c: CuentaParaCobro): OpcionDePago[] {
  const p = c.pago;
  if (c.fase === "por_pagar") {
    const confirmar = r2(p.faltaParaConfirmar);
    const todo = r2(p.faltaTotal);
    if (!(confirmar > 0)) return [];
    const ops: OpcionDePago[] = [{ para: "Confirmar", monto: confirmar }];
    if (todo > confirmar + 0.009) ops.push({ para: "Todo", monto: todo });
    return ops;
  }
  if (c.fase === "confirmado") {
    const falta = r2(p.faltaTotal);
    return falta > 0 ? [{ para: "Lo que falta", monto: falta }] : [];
  }
  return [];
}

/** El monto que se cobra lo decide SIEMPRE el servidor con la cuenta del momento. */
export function montoACobrar(c: CuentaParaCobro, para: ParaPago): { ok: true; monto: number } | { ok: false; error: string } {
  const op = opcionesDePago(c).find((o) => o.para === para);
  if (!op) {
    if (c.fase === "confirmado" || c.fase === "por_pagar") return { ok: false, error: "No hay nada pendiente por pagar." };
    return { ok: false, error: "Este pedido no admite pagos en línea ahora." };
  }
  return { ok: true, monto: op.monto };
}

// ─── Desglose para la pasarela ──────────────────────────────────────────────

/**
 * Desglose en centavos (lo que pide la cajita): precio con IVA incluido.
 * $205 → base $178,26 + IVA $26,74. La suma siempre es exacta.
 */
export function desgloseIva(monto: number): { totalC: number; baseC: number; ivaC: number } {
  const totalC = aCentavos(monto);
  const baseC = Math.round(totalC / (1 + TASA_IVA));
  return { totalC, baseC, ivaC: totalC - baseC };
}

/** Tarifa de la pasarela y neto que llega a SGINGRESOS. */
export function tarifaYNeto(monto: number, pasarela: Pasarela, medio: MedioPago): { tarifa: number; neto: number } {
  const totalC = aCentavos(monto);
  const tarifaC = Math.round((totalC * (TARIFAS[pasarela]?.[medio] ?? 0)) / 10000);
  return { tarifa: deCentavos(tarifaC), neto: deCentavos(totalC - tarifaC) };
}

// ─── Lo que responde PayPhone ───────────────────────────────────────────────

/** Campos de la respuesta de "Confirm" que usamos (docs.payphone.app/cajita-de-pagos). */
export type RespuestaPayPhone = {
  statusCode?: number;
  transactionStatus?: string;
  transactionId?: number | string;
  clientTransactionId?: string;
  amount?: number;
  currency?: string;
  authorizationCode?: string;
  cardType?: string;
  cardBrand?: string;
  lastDigits?: string;
  bin?: string;
  message?: string | null;
};

/**
 * Medio con que pagó. Si no hay datos de tarjeta, pagó con saldo PayPhone.
 * Ante la duda se asume tarjeta (con comisión): así el neto propuesto nunca
 * es mayor a lo que de verdad llega.
 */
export function medioPayPhone(r: RespuestaPayPhone): MedioPago {
  const tipo = (r.cardType ?? "").toLowerCase();
  if (tipo === "debit") return "Tarjeta de débito";
  if (tipo === "credit") return "Tarjeta de crédito";
  const sinTarjeta = !(r.cardBrand ?? "").trim() && !(r.lastDigits ?? "").trim() && !(r.bin ?? "").trim();
  return sinTarjeta ? "Saldo PayPhone" : "Tarjeta de crédito";
}

/** "Visa ···· 4242" (nunca el número completo). Vacío si no pagó con tarjeta. */
export function tarjetaVisible(r: RespuestaPayPhone): string {
  const digitos = (r.lastDigits ?? "").replace(/\D/g, "").slice(-4);
  const marca = (r.cardBrand ?? "").trim();
  if (!digitos && !marca) return "";
  return [marca || "Tarjeta", digitos ? `···· ${digitos}` : ""].filter(Boolean).join(" ");
}

export type Intento = {
  codigo: string;
  monto: number;
  estado: EstadoPago;
  idTransaccion: string;
};

export type ResultadoConfirmacion =
  | { tipo: "aprobado"; idTransaccion: string; autorizacion: string; medio: MedioPago; tarjeta: string }
  | { tipo: "rechazado"; detalle: string }
  | { tipo: "sospechoso"; detalle: string }
  | { tipo: "desconocido"; detalle: string };

/**
 * ¿Qué nos dijo PayPhone del intento? No basta con "Approved": el código,
 * el monto y la moneda deben ser los que guardamos al abrir la cajita (la
 * cajita usa un token visible en el navegador; alguien podría pagar $1 con
 * nuestro código). Si no coinciden → "sospechoso": no se registra abono.
 */
export function evaluarConfirmacion(intento: Pick<Intento, "codigo" | "monto">, r: RespuestaPayPhone): ResultadoConfirmacion {
  const id = r.transactionId != null ? String(r.transactionId) : "";
  if (r.statusCode === 2 || (r.transactionStatus ?? "").toLowerCase() === "canceled") {
    return { tipo: "rechazado", detalle: r.message?.trim() || "Pago no aprobado." };
  }
  if (r.statusCode !== 3 || (r.transactionStatus ?? "").toLowerCase() !== "approved") {
    return { tipo: "desconocido", detalle: `Respuesta sin aprobación (statusCode ${r.statusCode ?? "—"}).` };
  }
  const problemas: string[] = [];
  if ((r.clientTransactionId ?? "") !== intento.codigo) problemas.push(`código ${r.clientTransactionId ?? "—"} ≠ ${intento.codigo}`);
  if (typeof r.amount !== "number" || r.amount !== aCentavos(intento.monto)) {
    problemas.push(`monto ${typeof r.amount === "number" ? usd(r.amount / 100) : "—"} ≠ ${usd(intento.monto)}`);
  }
  if (r.currency && r.currency.toUpperCase() !== "USD") problemas.push(`moneda ${r.currency}`);
  if (!id) problemas.push("sin ID de transacción");
  if (problemas.length) return { tipo: "sospechoso", detalle: `Aprobado por PayPhone pero no coincide: ${problemas.join("; ")}.` };
  return {
    tipo: "aprobado",
    idTransaccion: id,
    autorizacion: (r.authorizationCode ?? "").trim(),
    medio: medioPayPhone(r),
    tarjeta: tarjetaVisible(r),
  };
}

// ─── ¿Se aplica el pago? ────────────────────────────────────────────────────

/** Huella de la elección del cliente al abrir la cajita. */
export function huellaEleccion(e: { fecha: string; elegidas: readonly string[] } | null): string {
  if (!e) return "";
  return `${e.fecha}|${[...e.elegidas].sort().join(",")}`;
}

export type DecisionAplicar =
  | { estado: "Aplicado"; confirmar: boolean }
  | { estado: "En revisión"; motivo: string };

/**
 * El pago ya fue aprobado (y verificado): siempre se registra el abono, porque
 * el dinero es real. Lo que se decide es si sigue solo o lo revisa el personal.
 * Ej.: Camila pagó $205 por el LG, pero mientras pagaba el empleado cambió el
 * precio → su elección ya no vale → "En revisión" (no se confirma otra cosa).
 */
export function decidirAplicacion(input: {
  para: ParaPago;
  monto: number;
  /** Cuenta al momento de aplicar, ANTES de sumar este pago. */
  cuenta: CuentaParaCobro;
  eleccionAlPagar: string;
  eleccionAhora: string;
}): DecisionAplicar {
  const { cuenta } = input;
  if (cuenta.fase === "cancelado") return { estado: "En revisión", motivo: "El pedido estaba cancelado al recibir el pago." };
  if (cuenta.fase === "entregado") return { estado: "En revisión", motivo: "El pedido ya estaba entregado al recibir el pago." };
  const falta = r2(cuenta.pago.faltaTotal);
  if (r2(input.monto) > falta + 0.009) {
    return { estado: "En revisión", motivo: `Pagó ${usd(input.monto)} y solo faltaban ${usd(falta)} (${usd(input.monto - falta)} de más).` };
  }
  if (input.para === "Lo que falta") return { estado: "Aplicado", confirmar: false };
  // Confirmar / Todo: el pago se hizo sobre una elección concreta.
  if (cuenta.fase === "confirmado") {
    // Mientras pagaba, la tienda ya confirmó el pedido (p. ej. registró otra
    // transferencia): el dinero suma a la cuenta, sin decisiones nuevas.
    return { estado: "Aplicado", confirmar: false };
  }
  if (cuenta.fase !== "por_pagar") return { estado: "En revisión", motivo: "El pedido ya no esperaba este pago." };
  if (!input.eleccionAhora || input.eleccionAhora !== input.eleccionAlPagar) {
    return { estado: "En revisión", motivo: "La opción elegida cambió mientras el cliente pagaba." };
  }
  return { estado: "Aplicado", confirmar: true };
}

const DEC_CONFIRMA = "Se aplica y confirma el pedido.";
const DEC_APLICA = "Se aplica a la cuenta.";
const DEC_REVISION = "Revisión: ";

/** La decisión se guarda en "Detalle" ANTES del abono, para reintentar igual. */
export function textoDecision(d: DecisionAplicar): string {
  if (d.estado === "En revisión") return `${DEC_REVISION}${d.motivo}`;
  return d.confirmar ? DEC_CONFIRMA : DEC_APLICA;
}

export function leerDecision(detalle: string): DecisionAplicar | null {
  const t = (detalle ?? "").trim();
  if (t.startsWith(DEC_CONFIRMA)) return { estado: "Aplicado", confirmar: true };
  if (t.startsWith(DEC_APLICA)) return { estado: "Aplicado", confirmar: false };
  if (t.startsWith(DEC_REVISION)) return { estado: "En revisión", motivo: t.slice(DEC_REVISION.length) };
  return null;
}

// ─── Lo que ve el cliente ───────────────────────────────────────────────────

export type PagoVisible = {
  codigo: string;
  /** cajita abierta · esperando confirmación · aprobado · rechazado · en revisión */
  estado: "abierto" | "sin_respuesta" | "recibido" | "rechazado" | "revision" | "vencido";
  monto: number;
  tarjeta: string;
  fecha: string;
  autorizacion: string;
};

/** El intento que el cliente debe ver (el último que no sea una cajita abierta o vencida). */
export function pagoParaMostrar(
  intentos: ReadonlyArray<{ codigo: string; estado: EstadoPago; idTransaccion: string; creado: string; monto: number; tarjeta: string; confirmadoEn: string; autorizacion: string }>,
  ahora: Date = new Date(),
): PagoVisible | null {
  for (let k = intentos.length - 1; k >= 0; k--) {
    const i = intentos[k];
    const estado = estadoVisible(i, ahora);
    if (estado === "abierto" || estado === "vencido") continue;
    return { codigo: i.codigo, estado, monto: i.monto, tarjeta: i.tarjeta, fecha: i.confirmadoEn || i.creado, autorizacion: i.autorizacion };
  }
  return null;
}

/** Minutos desde que se abrió la cajita. */
export function minutosDesde(iso: string, ahora: Date = new Date()): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? (ahora.getTime() - t) / 60000 : Infinity;
}

/**
 * Cómo se muestra un intento. "sin_respuesta" = volvió de PayPhone pero aún no
 * pudimos confirmarlo: el botón se esconde ("No pagues otra vez").
 */
export function estadoVisible(i: { estado: EstadoPago; idTransaccion: string; creado: string }, ahora: Date = new Date()): PagoVisible["estado"] {
  switch (i.estado) {
    case "Aplicado": return "recibido";
    case "Aprobado": return "sin_respuesta";
    case "En revisión": return "revision";
    case "Rechazado": return "rechazado";
    case "Vencido": return "vencido";
    case "Abierto":
      if (i.idTransaccion) return "sin_respuesta";
      return minutosDesde(i.creado, ahora) > MINUTOS_VIGENCIA_CAJITA ? "vencido" : "abierto";
  }
}

/** Texto del campo principal de la tabla: "PL-000001 · OP-142 · $205.00 · PayPhone". */
export function resumenPago(input: { codigo: string; cuenta: string; monto: number; pasarela: Pasarela; ambiente: Ambiente }): string {
  return [input.codigo, input.cuenta, usd(input.monto), input.pasarela, input.ambiente === "Prueba" ? "PRUEBA" : ""].filter(Boolean).join(" · ");
}

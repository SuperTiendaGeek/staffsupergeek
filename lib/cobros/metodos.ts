// Catálogo ÚNICO de métodos de cobro (auditoría ops, punto 7).
//
// Un método de cobro dice TODO lo que hace falta saber de un pago:
//   · a qué cuenta de Finanzas entra el dinero (y si llega ya acreditado o
//     queda "por acreditar", como las tarjetas);
//   · cómo se registra en Finanzas (campo "Método" de Movimientos);
//   · qué código de forma de pago del SRI lleva la factura;
//   · si exige número de transacción.
//
// Modelo profesional (Odoo, Lightspeed): cada "método de pago / diario" está
// atado a una cuenta; el código fiscal se DEDUCE. Antes la factura y el
// recibo de mostrador pedían el código SRI ("20 – Otros con utilización del
// sistema financiero"), que no dice si el dinero entró a Banco Pichincha, a
// DeUna o a Mercado Pago: 83 ingresos quedaron sin cuenta (punto 7).
//
// Lo usan los abonos (orden, operación, reserva), la factura y el recibo de
// mostrador, la venta adicional y los puentes a Finanzas. Puro: sin servidor.
//
// El valor guardado (clave) es el que va al campo "Método de Pago" de Abonos;
// "Transferencia" se sigue guardando así aunque se muestre como "Transferencia
// Banco Pichincha → SGINGRESOS".

export type EstadoIngreso = "Confirmado" | "Pendiente";

export type DefinicionMetodo = {
  /** Cómo se muestra, con la cuenta a la que entra el dinero. */
  etiqueta: string;
  /** Cuenta de Finanzas ("Cuentas Financieras".Nombre). null = sin cuenta (solo métodos viejos). */
  cuenta: string | null;
  /** Confirmado = ya está en la cuenta; Pendiente = por acreditar (tarjetas, Mercado Pago). */
  estado: EstadoIngreso;
  /** Opción del campo "Método" de Movimientos Financieros. */
  metodoFinanzas: string;
  /** Forma de pago SRI (Ficha técnica, tabla 22). */
  codigoSri: string;
  /** Número de transacción obligatorio. */
  exigeReferencia: boolean;
  /** Se ofrece para cobros nuevos (los viejos siguen siendo legibles). */
  vigente: boolean;
};

export const METODOS_COBRO = {
  Efectivo: { etiqueta: "Efectivo → Caja Registradora", cuenta: "Caja Registradora", estado: "Confirmado", metodoFinanzas: "Efectivo", codigoSri: "01", exigeReferencia: false, vigente: true },
  Transferencia: { etiqueta: "Transferencia Banco Pichincha → SGINGRESOS", cuenta: "SGINGRESOS", estado: "Confirmado", metodoFinanzas: "Transferencia bancaria", codigoSri: "20", exigeReferencia: true, vigente: true },
  "Transferencia Produbanco": { etiqueta: "Transferencia Produbanco → Produbanco Ahorros", cuenta: "Produbanco Ahorros", estado: "Confirmado", metodoFinanzas: "Transferencia bancaria", codigoSri: "20", exigeReferencia: true, vigente: true },
  Depósito: { etiqueta: "Depósito Banco Pichincha → SGINGRESOS", cuenta: "SGINGRESOS", estado: "Confirmado", metodoFinanzas: "Depósito", codigoSri: "20", exigeReferencia: false, vigente: true },
  DeUna: { etiqueta: "DeUna → cuenta DeUna (no es Banco Pichincha)", cuenta: "DeUna", estado: "Confirmado", metodoFinanzas: "DeUna", codigoSri: "20", exigeReferencia: true, vigente: true },
  "Tarjeta de crédito": { etiqueta: "Tarjeta de crédito → Tarjetas en Tránsito", cuenta: "Tarjetas en Tránsito", estado: "Pendiente", metodoFinanzas: "Tarjeta crédito", codigoSri: "19", exigeReferencia: false, vigente: true },
  "Tarjeta de débito": { etiqueta: "Tarjeta de débito → Tarjetas en Tránsito", cuenta: "Tarjetas en Tránsito", estado: "Pendiente", metodoFinanzas: "Tarjeta débito", codigoSri: "16", exigeReferencia: false, vigente: true },
  PayPhone: { etiqueta: "PayPhone → Tarjetas en Tránsito", cuenta: "Tarjetas en Tránsito", estado: "Pendiente", metodoFinanzas: "PayPhone", codigoSri: "20", exigeReferencia: false, vigente: true },
  PayPal: { etiqueta: "PayPal → cuenta PayPal", cuenta: "PayPal", estado: "Confirmado", metodoFinanzas: "PayPal", codigoSri: "20", exigeReferencia: false, vigente: true },
  "Mercado Libre": { etiqueta: "Mercado Libre → Mercado Pago", cuenta: "Mercado Pago", estado: "Pendiente", metodoFinanzas: "Mercado Pago", codigoSri: "20", exigeReferencia: true, vigente: true },
  // Solo para leer cobros viejos: "Tarjeta" no distinguía crédito/débito
  // (se asumía crédito) y "Otro" no dice a qué cuenta entró el dinero.
  Tarjeta: { etiqueta: "Tarjeta → Tarjetas en Tránsito", cuenta: "Tarjetas en Tránsito", estado: "Pendiente", metodoFinanzas: "Tarjeta", codigoSri: "19", exigeReferencia: false, vigente: false },
  Otro: { etiqueta: "Otro (sin cuenta)", cuenta: null, estado: "Confirmado", metodoFinanzas: "Otro", codigoSri: "20", exigeReferencia: false, vigente: false },
} as const satisfies Record<string, DefinicionMetodo>;

export type MetodoCobro = keyof typeof METODOS_COBRO;

/** Todos los métodos conocidos (incluye los viejos), en orden de pantalla. */
export const TODOS_LOS_METODOS = Object.keys(METODOS_COBRO) as MetodoCobro[];

/** Los que se ofrecen para cobros nuevos, en orden de pantalla. */
export const METODOS_VIGENTES = TODOS_LOS_METODOS.filter((m) => METODOS_COBRO[m].vigente);

export function esMetodoCobro(valor: unknown): valor is MetodoCobro {
  return typeof valor === "string" && Object.prototype.hasOwnProperty.call(METODOS_COBRO, valor);
}

export function esMetodoVigente(valor: unknown): valor is MetodoCobro {
  return esMetodoCobro(valor) && METODOS_COBRO[valor].vigente;
}

export function definicionMetodo(valor: unknown): DefinicionMetodo | null {
  return esMetodoCobro(valor) ? METODOS_COBRO[valor] : null;
}

export function etiquetaMetodo(valor: string): string {
  return definicionMetodo(valor)?.etiqueta ?? valor;
}

export function codigoSriDeMetodo(valor: unknown): string | null {
  return definicionMetodo(valor)?.codigoSri ?? null;
}

export function exigeReferencia(valor: unknown): boolean {
  return definicionMetodo(valor)?.exigeReferencia ?? false;
}

/** null = el cobro tiene método vigente y, si lo exige, número de transacción. */
export function mensajeCobroInvalido(pago: { metodoPago?: string | null; referencia?: string | null; total?: number }): string | null {
  const monto = typeof pago.total === "number" ? ` de $${pago.total.toFixed(2)}` : "";
  if (!esMetodoVigente(pago.metodoPago)) return `Elige cómo se cobró el pago${monto} (método y cuenta).`;
  if (exigeReferencia(pago.metodoPago) && !pago.referencia?.trim()) {
    return `Falta el número de transacción del pago${monto} (${METODOS_COBRO[pago.metodoPago].etiqueta}).`;
  }
  return null;
}

/**
 * Para leer cobros VIEJOS que solo guardaron el código SRI (recibos y
 * reservas anteriores al punto 7): el método más probable. El "20" se
 * interpreta como transferencia a Banco Pichincha, que es lo habitual; los
 * casos dudosos se corrigieron a mano con la hoja del dueño.
 */
export function metodoDesdeCodigoSri(codigo: string): MetodoCobro | null {
  switch (codigo) {
    case "01": return "Efectivo";
    case "16": return "Tarjeta de débito";
    case "18": return "Tarjeta de débito";
    case "19": return "Tarjeta de crédito";
    case "20": return "Transferencia";
    default: return null; // "15" compensación, "17", "21": sin cuenta
  }
}

// ─── Varios cobros de una venta (mostrador, venta adicional, saldo) ──────────

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const dinero = (n: number) => `$${round2(n).toFixed(2)}`;
const TOLERANCIA = 0.01;

export type CobroInput = { metodoPago?: string | null; total: number; referencia?: string | null };

/**
 * Valida los cobros de una venta: cada uno con método vigente (con cuenta),
 * monto > 0 y número de transacción si el método lo exige; y que sumen el
 * total. `que` nombra lo que se cobra en los mensajes ("la venta", "la venta
 * adicional"). null = todo bien.
 */
export function mensajeCobrosInvalidos(pagos: readonly CobroInput[], total: number, que = "la venta"): string | null {
  const t = round2(total);
  if (pagos.length === 0) return `Falta registrar cómo pagó el cliente ${que} (${dinero(t)}).`;
  for (const p of pagos) {
    const metodo = p.metodoPago?.trim() ?? "";
    if (!esMetodoVigente(metodo)) {
      return metodo
        ? `El método "${metodo}" no sirve para cobrar: no dice a qué cuenta entra el dinero. Elige otro.`
        : `Elige el método de pago de ${que}.`;
    }
    if (!(p.total > 0)) return `Cada pago de ${que} debe ser mayor a $0.`;
    if (exigeReferencia(metodo) && !p.referencia?.trim()) {
      return `El número de transacción es obligatorio para "${METODOS_COBRO[metodo].etiqueta}" (${dinero(p.total)}).`;
    }
  }
  const suma = round2(pagos.reduce((s, p) => s + p.total, 0));
  if (Math.abs(round2(suma - t)) > TOLERANCIA) {
    const nombre = que.charAt(0).toUpperCase() + que.slice(1);
    return `Los pagos de ${que} suman ${dinero(suma)} y ${que === "la venta" ? "el total" : nombre.toLowerCase()} es de ${dinero(t)}.`;
  }
  return null;
}

export type PagoDocumento = { formaPago: string; total: number; metodoPago?: string; referencia?: string; origenPago?: string };

/**
 * Servidor: los cobros NUEVOS de un documento (mostrador, saldo de una
 * reserva, diferencia de un reemplazo) deben traer un método vigente; el
 * código SRI se DEDUCE del método (no se confía en el que mande la pantalla).
 * No se tocan: los abonos ya registrados ("abono") y la compensación con
 * crédito de una nota de crédito (código "15", no entra dinero nuevo).
 */
export function normalizarCobrosNuevos<T extends PagoDocumento>(pagos: readonly T[]): { error: string | null; pagos: T[] } {
  const out: T[] = [];
  for (const p of pagos) {
    if (p.origenPago === "abono" || p.formaPago === "15") { out.push(p); continue; }
    const error = mensajeCobroInvalido(p);
    if (error) return { error, pagos: [...pagos] };
    out.push({ ...p, formaPago: METODOS_COBRO[p.metodoPago as MetodoCobro].codigoSri, referencia: p.referencia?.trim() || undefined });
  }
  return { error: null, pagos: out };
}

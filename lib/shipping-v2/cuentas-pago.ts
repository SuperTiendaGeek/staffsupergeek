// Cuentas de las que sale el pago a un proveedor (compras, flete, arancel) —
// catálogo ÚNICO, puro (Fase 2B, 2-nov-2026). Es el espejo de
// lib/cobros/metodos.ts para el dinero que SALE.
//
// Antes "Cuenta origen" de Shipping Pagos eran nombres sueltos ("Tarjeta C.
// Produbanco", "Tarjeta D. Supe Geek ") que no coincidían con las cuentas de
// Finanzas: el egreso quedaba SIN cuenta (OC-000001/2) y no había forma de
// elegir "transferencia desde SGINGRESOS". Ahora cada opción dice a qué
// cuenta de Finanzas pertenece.
//
// Ejemplos del día a día:
//   · Compra a Pixel PC pagada por transferencia → "Transferencia SGINGRESOS"
//     → egreso desde SGINGRESOS.
//   · Compra en eBay con la Mastercard de Produbanco → "Tarjeta C. Produbanco"
//     → egreso desde PRODUBANCO MASTERCARD (la deuda de la tarjeta sube).
//   · Compra con la débito Visa SUPER GEEK del Pichincha → sale de SGINGRESOS.
//
// `valor` es lo que se guarda en "Cuenta origen" (las opciones viejas se
// conservan tal cual, con su espacio final si lo tienen).

export type CuentaPago = {
  valor: string;
  etiqueta: string;
  /** "Cuentas Financieras".Nombre; null = no se sabe a qué cuenta pertenece. */
  cuentaFinanzas: string | null;
  /** Se ofrece para pagos nuevos (las demás solo se leen). */
  vigente: boolean;
};

export const CUENTAS_PAGO: readonly CuentaPago[] = [
  { valor: "Transferencia SGINGRESOS", etiqueta: "Transferencia Banco Pichincha → SGINGRESOS", cuentaFinanzas: "SGINGRESOS", vigente: true },
  { valor: "Tarjeta D. Supe Geek ", etiqueta: "Débito Visa SUPER GEEK (Pichincha) → SGINGRESOS", cuentaFinanzas: "SGINGRESOS", vigente: true },
  { valor: "Tarjeta C. Produbanco", etiqueta: "Crédito Produbanco Mastercard", cuentaFinanzas: "PRODUBANCO MASTERCARD", vigente: true },
  { valor: "Tarjeta C. Pacificard", etiqueta: "Crédito Pacificard", cuentaFinanzas: "Pacificard", vigente: true },
  { valor: "Transferencia Produbanco Ahorros", etiqueta: "Transferencia Produbanco → Produbanco Ahorros", cuentaFinanzas: "Produbanco Ahorros", vigente: true },
  { valor: "Caja", etiqueta: "Efectivo → Caja Registradora", cuentaFinanzas: "Caja Registradora", vigente: true },
  { valor: "PayPal", etiqueta: "PayPal", cuentaFinanzas: "PayPal", vigente: true },
  // Ya no se ofrecen (dueño, 3-nov-2026): la tarjeta de crédito Pichincha
  // caducó y "Otra" no es ninguna cuenta real. Los pagos viejos con estas
  // opciones (en realidad transferencias desde SGINGRESOS) se corrigen en el
  // Corte de apertura.
  { valor: "Tarjeta C. Pichincha", etiqueta: "Tarjeta C. Pichincha (caducada)", cuentaFinanzas: null, vigente: false },
  { valor: "Otra", etiqueta: "Otra (sin cuenta)", cuentaFinanzas: null, vigente: false },
  // Solo lectura (valor del select viejo de Finanzas).
  { valor: "Banco Pichincha", etiqueta: "Banco Pichincha → SGINGRESOS", cuentaFinanzas: "SGINGRESOS", vigente: false },
];

export const CUENTAS_PAGO_VIGENTES = CUENTAS_PAGO.filter((c) => c.vigente);

const norm = (v: string | null | undefined) =>
  String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export function cuentaPago(valor: string | null | undefined): CuentaPago | null {
  const n = norm(valor);
  if (!n) return null;
  return CUENTAS_PAGO.find((c) => norm(c.valor) === n) ?? null;
}

/** El valor exacto a guardar (con su espacio final, si lo tiene) o null si no es una opción vigente. */
export function valorCuentaPagoVigente(valor: string | null | undefined): string | null {
  const c = cuentaPago(valor);
  return c && c.vigente ? c.valor : null;
}

export function etiquetaCuentaPago(valor: string | null | undefined): string {
  return cuentaPago(valor)?.etiqueta ?? String(valor ?? "").trim();
}

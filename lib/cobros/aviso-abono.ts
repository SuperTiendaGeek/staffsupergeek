// Aviso al registrar un abono por MÁS de lo que se debe — auditoría ops,
// punto 22 (6-nov-2026, caso OR000525). PURO.
//
// El error se evita donde nace: si el cliente paga junto lo que debe y algo
// que compra de paso, lo de paso NO va como abono de la cuenta (quedaría como
// "sobrante"): se cobra como venta adicional al emitir el documento.

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** null = sin aviso. `saldoPendiente` = lo que falta cobrar en la cuenta (≤ 0 si ya está pagada). */
export function avisoAbonoDeMas(monto: number, saldoPendiente: number): string | null {
  if (!(monto > 0) || !Number.isFinite(saldoPendiente)) return null;
  const debe = Math.max(0, r2(saldoPendiente));
  const deMas = r2(monto - debe);
  if (deMas <= 0.01) return null;
  const cuanto = `$${deMas.toFixed(2)}`;
  return debe > 0
    ? `Son ${cuanto} más de lo que se debe ($${debe.toFixed(2)}). Si es algo que compra ahora, registra $${debe.toFixed(2)} y cobra el resto como venta adicional al emitir.`
    : `La cuenta ya está pagada: estos ${cuanto} quedarían de más. Si es algo que compra ahora, cóbralo como venta adicional al emitir.`;
}

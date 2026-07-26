/**
 * Test — reglas puras de reservas.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/reserva.reglas.test.ts
 */

import {
  abonoMinimo, fechaLimiteReserva, diasRestantesReserva, reservaVencida,
  saldoPendiente, pagoCompleto, validarAbono,
} from "../reservas/reglas";

let fallos = 0;
function assert(cond: boolean, msg: string): void { if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); } }

// ── Abono mínimo ────────────────────────────────────────────────────────────
assert(abonoMinimo(120) === 20, "precio > $50 → mínimo $20");
assert(abonoMinimo(50) === 5,   "precio == $50 → mínimo $5 (el umbral es > 50)");
assert(abonoMinimo(30) === 5,   "precio < $50 → mínimo $5");
assert(abonoMinimo(3) === 3,    "precio $3 → mínimo capado al precio ($3)");

// ── Fecha límite y vencimiento ──────────────────────────────────────────────
{
  const base = new Date(2026, 6, 10); // 10-jul-2026
  assert(fechaLimiteReserva(base, 7).getDate() === 17,  "plazo 7 días → 17-jul");
  assert(fechaLimiteReserva(base, 15).getDate() === 25, "plazo 15 días → 25-jul");
  const lim30 = fechaLimiteReserva(base, 30);           // 9-ago-2026
  assert(lim30.getMonth() === 7 && lim30.getDate() === 9, "plazo 30 días → 9-ago");

  const lim = fechaLimiteReserva(base, 7); // 17-jul
  assert(diasRestantesReserva(lim, new Date(2026, 6, 15)) === 2, "15-jul: faltan 2 días");
  assert(reservaVencida(lim, new Date(2026, 6, 17)) === false, "el mismo día del límite NO está vencida");
  assert(reservaVencida(lim, new Date(2026, 6, 18)) === true,  "un día después SÍ está vencida");
}

// ── Saldo / pago completo ───────────────────────────────────────────────────
assert(saldoPendiente(100, 30) === 70, "saldo = precio - abonado");
assert(saldoPendiente(100, 120) === 0, "saldo nunca negativo");
assert(pagoCompleto(100, 100) === true,  "abonado == precio → pago completo");
assert(pagoCompleto(100, 99.99) === false, "falta un centavo → no completo");
assert(pagoCompleto(100, 100.5) === true,  "abonado > precio → completo");

// ── Validar abono ───────────────────────────────────────────────────────────
assert(validarAbono(20, 120, 0) === null, "primer abono $20 en ítem >$50 → válido");
assert(validarAbono(10, 120, 0) !== null, "primer abono $10 en ítem >$50 → rechazado (min $20)");
assert(validarAbono(5, 30, 0) === null,   "primer abono $5 en ítem ≤$50 → válido");
assert(validarAbono(2, 30, 5) === null,   "abono siguiente pequeño → válido");
assert(validarAbono(0, 120, 0) !== null,  "abono 0 → rechazado");
assert(validarAbono(100, 120, 30) !== null, "abono que excede el saldo → rechazado");
assert(validarAbono(90, 120, 30) === null,  "abono que completa exacto el saldo → válido");

if (fallos > 0) { console.error(`\n❌ reserva.reglas.test.ts — ${fallos} fallidas`); process.exit(1); }
console.log("\n✅ reserva.reglas.test.ts — todos los asserts pasaron");

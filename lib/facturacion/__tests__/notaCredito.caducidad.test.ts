/**
 * Test — caducidad del crédito de una nota de crédito.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/notaCredito.caducidad.test.ts
 *
 * Puro: sin red, sin Airtable, sin reloj real.
 *
 * Lo que protege: un crédito que caduca se convierte en ingreso. Si la fecha
 * sale un día antes, le quitas crédito a un cliente que todavía lo tenía. Si
 * sale un día después o el proceso se ejecuta dos veces, te anotas un ingreso
 * que no existe.
 */

import {
  fechaDeCaducidad,
  yaVencio,
  estadoCredito,
  debeCaducar,
  diasParaCaducar,
  MESES_DE_VIGENCIA,
} from "../notaCredito/caducidad";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. La fecha
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n── seis meses, contados como los cuenta una persona ──");

assert(MESES_DE_VIGENCIA === 6, "La vigencia son 6 meses");

// La nota de crédito real de Alex, emitida el día del corte.
assert(fechaDeCaducidad("2026-08-14T12:27:21-05:00") === "2027-02-14",
  "Autorizada el 14-ago-2026 → caduca el 14-feb-2027");

assert(fechaDeCaducidad("2026-08-14") === "2027-02-14",
  "Da igual si la fecha viene con hora o sin ella");

assert(fechaDeCaducidad("2026-01-15") === "2026-07-15",
  "15-ene → 15-jul, dentro del mismo año");

console.log("\n── los meses cortos no regalan días ──");

// Sumar 6 meses a un 31 con Date() se desborda: el 31 de agosto se volvería
// 3 de marzo y el cliente tendría tres días de crédito de más.
assert(fechaDeCaducidad("2026-08-31") === "2027-02-28",
  "31-ago-2026 → 28-feb-2027, no se desborda a marzo");

assert(fechaDeCaducidad("2027-08-31") === "2028-02-29",
  "31-ago-2027 → 29-feb-2028, porque 2028 es bisiesto");

assert(fechaDeCaducidad("2026-10-31") === "2027-04-30",
  "31-oct → 30-abr, que abril tiene 30");

assert(fechaDeCaducidad("2026-12-25") === "2027-06-25",
  "Cruzar el fin de año no descuadra el mes");

console.log("\n── sin fecha legible no se inventa nada ──");

assert(fechaDeCaducidad("") === "", "Cadena vacía → cadena vacía");
assert(fechaDeCaducidad("no es una fecha") === "", "Texto cualquiera → cadena vacía");

// ═══════════════════════════════════════════════════════════════════════════
// 2. El vencimiento
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n── el día que caduca todavía vale ──");

assert(yaVencio("2027-02-14", "2027-02-13") === false, "Un día antes: vigente");
assert(yaVencio("2027-02-14", "2027-02-14") === false,
  "EL MISMO DÍA todavía vale — ante la duda, a favor del cliente");
assert(yaVencio("2027-02-14", "2027-02-15") === true,  "Al día siguiente: vencido");
assert(yaVencio("2027-02-14", "2028-01-01") === true,  "Un año después: vencido");

assert(yaVencio("", "2027-02-15") === false,
  "Sin fecha de caducidad no se caduca nada: fail-closed");

console.log("\n── días restantes ──");

assert(diasParaCaducar("2027-02-14", "2027-02-04") === 10, "Faltan 10 días");
assert(diasParaCaducar("2027-02-14", "2027-02-14") === 0,  "Hoy es el último día");
assert(diasParaCaducar("2027-02-14", "2027-02-24") === -10, "Venció hace 10 días");
assert(diasParaCaducar("", "2027-02-14") === null, "Sin fecha, no hay cuenta que hacer");

// ═══════════════════════════════════════════════════════════════════════════
// 3. El estado del crédito
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n── qué estado le toca al crédito ──");

const base = { estado: "AUTORIZADO", fechaCaducidad: "2027-02-14" };

assert(estadoCredito({ ...base, saldoDisponible: 5 }, "2026-08-20") === "Vigente",
  "Con saldo y dentro del plazo → Vigente");
assert(estadoCredito({ ...base, saldoDisponible: 0 }, "2026-08-20") === "Consumido",
  "Sin saldo → Consumido: el cliente lo usó, no hay nada que caducar");
assert(estadoCredito({ ...base, saldoDisponible: 5 }, "2027-03-01") === "Caducado",
  "Con saldo y fuera de plazo → Caducado");

assert(estadoCredito({ ...base, saldoDisponible: 5, estadoCredito: "Caducado" }, "2026-08-20") === "Caducado",
  "Caducar es definitivo: no revive porque alguien edite el saldo a mano en Airtable");

assert(estadoCredito({ estado: "NO AUTORIZADO", saldoDisponible: 340, fechaCaducidad: "2026-01-01" }, "2027-01-01") === "Vigente",
  "Una NC que el SRI no autorizó nunca tuvo crédito, así que tampoco caduca");

// ═══════════════════════════════════════════════════════════════════════════
// 4. Idempotencia — lo que evita cobrar dos veces el mismo crédito
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n── el proceso se puede correr dos veces sin duplicar ingresos ──");

const vencida = { estado: "AUTORIZADO", saldoDisponible: 5, fechaCaducidad: "2027-02-14" };

assert(debeCaducar(vencida, "2027-03-01") === true,
  "Vencida y sin procesar → hay trabajo que hacer");
assert(debeCaducar({ ...vencida, movimientoCaducidadIds: ["recMOV1"] }, "2027-03-01") === false,
  "Si ya tiene su movimiento de caducidad, NO se vuelve a tocar");
assert(debeCaducar({ ...vencida, movimientoCaducidadIds: [] }, "2027-03-01") === true,
  "Un array vacío cuenta como no procesada");

assert(debeCaducar(vencida, "2027-02-14") === false,
  "El mismo día de la caducidad todavía no se procesa");
assert(debeCaducar({ ...vencida, saldoDisponible: 0 }, "2027-03-01") === false,
  "Sin saldo no hay nada que convertir en ingreso");
assert(debeCaducar({ ...vencida, estado: "DEVUELTA" }, "2027-03-01") === false,
  "Una NC rechazada por el SRI no genera ingreso al caducar");

// ─────────────────────────────────────────────────────────────────────────────

if (fallos > 0) {
  console.error(`\n❌ notaCredito.caducidad.test.ts — ${fallos} aserción(es) fallida(s)`);
  process.exit(1);
}
console.log("\n✅ notaCredito.caducidad.test.ts — todos los asserts pasaron");

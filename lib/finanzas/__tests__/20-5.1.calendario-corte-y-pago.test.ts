/**
 * Test §9 #1-#5 del diseño de Fase 20.5 — aritmética de fechas de
 * fechaCorteMasReciente/proximaFechaDePago, todo en UTC explícito: día 31 en
 * meses de 30 días, febrero (año no bisiesto y bisiesto), cambio de año, y
 * proximaFechaDePago con el día ya pasado/coincidiendo exacto con hoy.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-5.1.calendario-corte-y-pago.test.ts
 *
 * Puro, sin red.
 */

import { fechaCorteMasReciente, proximaFechaDePago } from "../tarjetas";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

function iso(anio: number, mesIndex: number, dia: number): string {
  return new Date(Date.UTC(anio, mesIndex, dia)).toISOString();
}

// #1 — día 31 en meses de 30 días: abril, junio, septiembre, noviembre.
for (const mesIndex of [3, 5, 8, 10]) {
  const hoy = new Date(Date.UTC(2026, mesIndex, 30, 12, 0, 0));
  const corte = fechaCorteMasReciente(hoy, 31);
  assert(corte.toISOString() === iso(2026, mesIndex, 30), `TC Día de Corte=31 en mes índice ${mesIndex} (30 días) cae el día 30`);
}

// #2 — febrero, año no bisiesto (2026 no es bisiesto) y bisiesto (2028).
const corteFeb2026 = fechaCorteMasReciente(new Date(Date.UTC(2026, 1, 28, 12, 0, 0)), 31);
assert(corteFeb2026.toISOString() === iso(2026, 1, 28), "TC Día de Corte=31 en febrero de un año no bisiesto (2026) cae el 28");

const corteFeb2028 = fechaCorteMasReciente(new Date(Date.UTC(2028, 1, 29, 12, 0, 0)), 31);
assert(corteFeb2028.toISOString() === iso(2028, 1, 29), "TC Día de Corte=31 en febrero de un año bisiesto (2028) cae el 29");

// #3 — cambio de año: TC Día de Corte=28, hoy=3 de enero → corte más reciente = 28 de diciembre del año anterior.
const corteFinDeAnio = fechaCorteMasReciente(new Date(Date.UTC(2027, 0, 3, 12, 0, 0)), 28);
assert(corteFinDeAnio.toISOString() === iso(2026, 11, 28), "Corte más reciente cruza el cambio de año correctamente (28 dic del año anterior)");

// #4 — proximaFechaDePago: hoy coincide exacto con el día de pago → cuenta como hoy, no rueda al mes siguiente.
const pagoHoyExacto = proximaFechaDePago(new Date(Date.UTC(2026, 6, 20, 0, 0, 0)), 20);
assert(pagoHoyExacto.toISOString() === iso(2026, 6, 20), "proximaFechaDePago cuenta 'hoy' cuando coincide exacto con el día de pago");

// #5 — proximaFechaDePago: el día ya pasó este mes → rueda al mes siguiente.
const pagoYaPaso = proximaFechaDePago(new Date(Date.UTC(2026, 3, 15, 0, 0, 0)), 10); // 15 de abril, TC Día de Pago=10 (ya pasó)
assert(pagoYaPaso.toISOString() === iso(2026, 4, 10), "proximaFechaDePago rueda al mes siguiente cuando el día ya pasó este mes");

// #5b — el mes al que rueda también necesita clamping: TC Día de Pago=30, hoy=31 de enero (ya pasó el 30) → rueda a
// febrero, que solo tiene 28 días en 2026 (no bisiesto) → clampea a 28.
const pagoRuedaYClampea = proximaFechaDePago(new Date(Date.UTC(2026, 0, 31, 0, 0, 0)), 30);
assert(pagoRuedaYClampea.toISOString() === iso(2026, 1, 28), "proximaFechaDePago rueda al mes siguiente Y clampea el día en el mes de destino (30 → 28 en febrero)");

if (fallos > 0) {
  console.error(`\n${fallos} fallo(s).`);
  process.exit(1);
}
console.log("\nOK — aritmética de calendario de corte/pago resuelve todos los bordes probados.");

/**
 * Test §9 #8 del diseño de Fase 20.5 — calcularEstadoTarjetaPuro: cupoExcedido
 * es false sin TC Cupo definido, true al superarlo, false justo por debajo
 * (borde exacto no cuenta como excedido).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-5.3.cupo-excedido.test.ts
 *
 * Puro, sin red.
 */

import { calcularEstadoTarjetaPuro } from "../tarjetas";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

const hoy = new Date(Date.UTC(2026, 6, 10));

// Sin TC Cupo definido — nunca excedido, sin importar la deuda.
{
  const cuenta = { id: "recT", tcDiaCorte: null, tcDiaPago: null, tcCupo: null };
  const estado = calcularEstadoTarjetaPuro(cuenta, -900, [], hoy);
  assert(estado.cupoExcedido === false, "Sin TC Cupo definido, cupoExcedido es siempre false");
}

// Cupo excedido.
{
  const cuenta = { id: "recT", tcDiaCorte: null, tcDiaPago: null, tcCupo: 500 };
  const estado = calcularEstadoTarjetaPuro(cuenta, -600, [], hoy); // deudaActual = 600 > 500
  assert(estado.cupoExcedido === true, "Deuda ($600) mayor al cupo ($500) marca cupoExcedido = true");
}

// Justo por debajo del cupo — no excedido.
{
  const cuenta = { id: "recT", tcDiaCorte: null, tcDiaPago: null, tcCupo: 500 };
  const estado = calcularEstadoTarjetaPuro(cuenta, -499.99, [], hoy);
  assert(estado.cupoExcedido === false, "Deuda ($499.99) justo por debajo del cupo ($500) no marca excedido");
}

// Exactamente igual al cupo — no excedido (el umbral es estrictamente mayor).
{
  const cuenta = { id: "recT", tcDiaCorte: null, tcDiaPago: null, tcCupo: 500 };
  const estado = calcularEstadoTarjetaPuro(cuenta, -500, [], hoy);
  assert(estado.cupoExcedido === false, "Deuda exactamente igual al cupo no marca excedido (umbral estrictamente mayor)");
}

if (fallos > 0) {
  console.error(`\n${fallos} fallo(s).`);
  process.exit(1);
}
console.log("\nOK — cupoExcedido se calcula correctamente en los 4 casos.");

/**
 * Test §7 #11 (Fase 20.4) — calcularReporteDiario(): rango de fechas
 * parametrizado. Llamar con un rango de 2 días (simulando el caso mensual
 * futuro) agrega correctamente movimientos de ambas fechas — confirma que
 * la función no está atada a "un solo día" pese a que la UI de esta fase
 * solo exponga eso.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-4.11.reporte-rango-parametrizado.test.ts
 */

import { calcularReporteDiario } from "../reporte";
import { crearMovimiento } from "../movimientos";
import { __resetCacheNombreTablaParaPruebas } from "../table-names";
import { activarEnvFalso, construirFetchDouble, crearCuentaDouble, crearEstadoDouble, limpiarEnvFalso } from "./_airtableDouble";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

async function main() {
  activarEnvFalso();
  __resetCacheNombreTablaParaPruebas();
  const state = crearEstadoDouble("Movimientos Financieros");
  const cajaId = crearCuentaDouble(state, { nombre: "Caja Registradora", fechaCorte: "2026-01-01" });
  global.fetch = construirFetchDouble(state) as typeof fetch;

  await crearMovimiento({ tipo: "Ingreso", origen: "Manual", categoria: "Otro", monto: 10, cuentaDestinoId: cajaId, estado: "Confirmado", fecha: "2026-07-24T10:00:00.000Z", registradoPor: "Test" });
  await crearMovimiento({ tipo: "Ingreso", origen: "Manual", categoria: "Otro", monto: 15, cuentaDestinoId: cajaId, estado: "Confirmado", fecha: "2026-07-25T10:00:00.000Z", registradoPor: "Test" });
  // Fuera del rango de 2 días que se va a pedir — no debe contarse.
  await crearMovimiento({ tipo: "Ingreso", origen: "Manual", categoria: "Otro", monto: 999, cuentaDestinoId: cajaId, estado: "Confirmado", fecha: "2026-07-26T10:00:00.000Z", registradoPor: "Test" });

  const soloUnDia = await calcularReporteDiario({ desde: "2026-07-24T00:00:00.000", hasta: "2026-07-25T00:00:00.000" });
  assert(soloUnDia.ingresos.total === 10, `Un solo día = $10 (obtenido: $${soloUnDia.ingresos.total})`);

  const rangoDeDosDias = await calcularReporteDiario({ desde: "2026-07-24T00:00:00.000", hasta: "2026-07-26T00:00:00.000" });
  assert(rangoDeDosDias.ingresos.total === 25, `Rango de 2 días = $25 (10+15, obtenido: $${rangoDeDosDias.ingresos.total})`);

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — calcularReporteDiario acepta cualquier rango, no solo un día.");
}

const fetchOriginal = global.fetch;
main();

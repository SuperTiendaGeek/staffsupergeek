/**
 * Test §7 #12 (Fase 20.4, Corrección 2) — registrarAjusteDeCuadre(): el
 * ajuste clasifica su rubro al nacer. Rubro Utilidad = |diferencia| (los
 * otros 3 en 0), Estado Distribución: Distribuido — tanto para faltante
 * como para sobrante. calcularSaldoRubroCuenta(cuenta, "utilidad") refleja
 * el signo correcto en cada caso (resta para faltante, suma para sobrante).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-4.12.ajuste-rubro-clasificado-al-nacer.test.ts
 */

import { crearCuadre, registrarAjusteDeCuadre } from "../cuadres";
import { calcularSaldoRubroCuenta } from "../saldos";
import { __resetCacheNombreTablaParaPruebas } from "../table-names";
import {
  activarEnvFalso,
  construirFetchDouble,
  crearCuentaDouble,
  crearEstadoDouble,
  limpiarEnvFalso,
  registrarTablaDouble,
} from "./_airtableDouble";

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
  registrarTablaDouble(state, "Finanzas Cuadres");
  const cajaId = crearCuentaDouble(state, { nombre: "Caja Registradora", saldoInicial: 100, fechaCorte: "2026-01-01" });
  global.fetch = construirFetchDouble(state) as typeof fetch;

  // Faltante — resta de la utilidad reconocida.
  const faltante = await crearCuadre({ cuentaId: cajaId, montoContado: 95, observacion: "Faltaron $5", realizadoPor: "Test" });
  const { movimiento: movFaltante } = await registrarAjusteDeCuadre(faltante.id, { registradoPor: "Admin" });
  assert(movFaltante.rubros.utilidad === 5, `Rubro Utilidad = 5 en el faltante (obtenido: ${movFaltante.rubros.utilidad})`);
  assert(
    movFaltante.rubros.capital === 0 && movFaltante.rubros.iva === 0 && movFaltante.rubros.repuestoExterno === 0,
    "Los otros 3 rubros quedan en 0"
  );
  assert(movFaltante.estadoDistribucion === "Distribuido", "Estado Distribución: Distribuido");

  const utilidadTrasFaltante = await calcularSaldoRubroCuenta(cajaId, "utilidad");
  assert(utilidadTrasFaltante === -5, `El faltante resta de la utilidad de la cuenta (obtenido: ${utilidadTrasFaltante})`);

  // Sobrante — suma a la utilidad reconocida. Saldo esperado ahora = 95.
  const sobrante = await crearCuadre({ cuentaId: cajaId, montoContado: 103, observacion: "Sobraron $8", realizadoPor: "Test" });
  const { movimiento: movSobrante } = await registrarAjusteDeCuadre(sobrante.id, { registradoPor: "Admin" });
  assert(movSobrante.rubros.utilidad === 8, `Rubro Utilidad = 8 en el sobrante (obtenido: ${movSobrante.rubros.utilidad})`);
  assert(movSobrante.estadoDistribucion === "Distribuido", "Estado Distribución: Distribuido también en el sobrante");

  const utilidadTrasSobrante = await calcularSaldoRubroCuenta(cajaId, "utilidad");
  assert(utilidadTrasSobrante === 3, `El sobrante suma a la utilidad (-5 + 8 = 3, obtenido: ${utilidadTrasSobrante})`);

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — el ajuste de cuadre clasifica su rubro al nacer, con el signo correcto.");
}

const fetchOriginal = global.fetch;
main();

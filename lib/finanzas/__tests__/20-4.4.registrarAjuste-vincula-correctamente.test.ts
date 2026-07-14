/**
 * Test §7 #4 (Fase 20.4) — registrarAjusteDeCuadre(): vincula correctamente.
 * Faltante → Ajuste con Cuenta Origen poblada, sin destino, monto =
 * |diferencia|. Sobrante → Cuenta Destino poblada, sin origen. El cuadre
 * queda con Estado de Ajuste: Ajustado y Movimiento de Ajuste enlazado.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-4.4.registrarAjuste-vincula-correctamente.test.ts
 */

import { crearCuadre, registrarAjusteDeCuadre } from "../cuadres";
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

  // Caso Faltante.
  const faltante = await crearCuadre({ cuentaId: cajaId, montoContado: 95, observacion: "Faltaron $5", realizadoPor: "Test" });
  const { cuadre: faltanteAjustado, movimiento: movFaltante } = await registrarAjusteDeCuadre(faltante.id, { registradoPor: "Admin" });
  assert(movFaltante.tipo === "Ajuste", "Faltante crea un movimiento de tipo Ajuste");
  assert(movFaltante.cuentaOrigenId === cajaId, "Faltante puebla Cuenta Origen");
  assert(!movFaltante.cuentaDestinoId, "Faltante no puebla Cuenta Destino");
  assert(movFaltante.monto === 5, `Faltante usa |diferencia| = 5 (obtenido: ${movFaltante.monto})`);
  assert(faltanteAjustado.estadoAjuste === "Ajustado", "El cuadre queda Ajustado");
  assert(faltanteAjustado.movimientoAjusteId === movFaltante.id, "El cuadre enlaza el movimiento creado");

  // Caso Sobrante. Saldo esperado ya refleja el ajuste anterior (100 - 5 = 95).
  const sobrante = await crearCuadre({ cuentaId: cajaId, montoContado: 103, observacion: "Sobraron $8", realizadoPor: "Test" });
  const { movimiento: movSobrante } = await registrarAjusteDeCuadre(sobrante.id, { registradoPor: "Admin" });
  assert(movSobrante.tipo === "Ajuste", "Sobrante crea un movimiento de tipo Ajuste");
  assert(movSobrante.cuentaDestinoId === cajaId, "Sobrante puebla Cuenta Destino");
  assert(!movSobrante.cuentaOrigenId, "Sobrante no puebla Cuenta Origen");
  assert(movSobrante.monto === 8, `Sobrante usa |diferencia| = 8 (obtenido: ${movSobrante.monto})`);

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — registrarAjusteDeCuadre vincula correctamente faltante y sobrante.");
}

const fetchOriginal = global.fetch;
main();

/**
 * Test §7 #13 (Fase 20.4, Corrección 3) — validarCuentasPorTipo(): un
 * Ajuste con solo Cuenta Destino (caso sobrante) no se rechaza. Verificado
 * en código (no solo analizado): crearMovimiento({ tipo: "Ajuste",
 * cuentaDestinoId: ..., cuentaOrigenId: undefined }) no lanza — confirma
 * que el caso sobrante del ajuste de cuadre nunca tropieza con esta
 * validación.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-4.13.ajuste-solo-cuenta-destino.test.ts
 */

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

  const movimiento = await crearMovimiento({
    tipo: "Ajuste",
    origen: "Manual",
    categoria: "Ajuste de Caja",
    monto: 8,
    cuentaOrigenId: undefined,
    cuentaDestinoId: cajaId,
    estado: "Confirmado",
    estadoDistribucion: "Distribuido",
    rubros: { utilidad: 8, capital: 0, iva: 0, repuestoExterno: 0 },
    registradoPor: "Test",
  });

  assert(movimiento.tipo === "Ajuste", "El Ajuste con solo Cuenta Destino se crea sin lanzar");
  assert(movimiento.cuentaDestinoId === cajaId, "Cuenta Destino queda poblada");
  assert(!movimiento.cuentaOrigenId, "Cuenta Origen queda vacía, como corresponde al caso sobrante");

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — validarCuentasPorTipo acepta Ajuste con solo Cuenta Destino, confirmado en código.");
}

const fetchOriginal = global.fetch;
main();

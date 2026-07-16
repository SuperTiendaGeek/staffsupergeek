/**
 * Test §9 #10-#11 del diseño de Fase 20.5 — Alerta Descuadre en tarjetas de
 * crédito: la deuda normal (saldo negativo por diseño) nunca la dispara sin
 * TC Cupo definido; superar TC Cupo sí la dispara, sin bloquear nunca el
 * consumo (el Egreso se crea igual en ambos casos).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-5.5.alerta-descuadre-tarjeta.test.ts
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

  // --- #10: deuda normal de tarjeta, sin TC Cupo definido, nunca marca Alerta Descuadre ---
  {
    __resetCacheNombreTablaParaPruebas();
    const state = crearEstadoDouble("Movimientos Financieros");
    global.fetch = construirFetchDouble(state) as typeof fetch;

    const tarjetaId = crearCuentaDouble(state, {
      nombre: "Tarjeta Sin Cupo",
      tipo: "Tarjeta de Crédito",
      saldoInicial: -900, // ya con mucha deuda acumulada
      fechaCorte: "2026-07-01T00:00:00.000Z",
      tcCupo: null,
    });

    const movimiento = await crearMovimiento({
      tipo: "Egreso",
      origen: "Manual",
      categoria: "Otro",
      monto: 500, // deja la deuda en $1400, muy por encima de cualquier saldo — igual no debe alertar
      cuentaOrigenId: tarjetaId,
      estado: "Confirmado",
      estadoDistribucion: "No aplica",
      fecha: "2026-07-15T12:00:00.000Z",
      observacion: "Consumo de prueba",
      registradoPor: "Test",
    });

    assert(!!movimiento.id, "El Egreso desde la tarjeta se crea sin lanzar error");
    assert(movimiento.alertaDescuadre === false, "Sin TC Cupo definido, la deuda normal nunca marca Alerta Descuadre");
  }

  // --- #11: superar TC Cupo sí marca Alerta Descuadre, y el movimiento se crea igual (nunca bloquea) ---
  {
    __resetCacheNombreTablaParaPruebas();
    const state = crearEstadoDouble("Movimientos Financieros");
    global.fetch = construirFetchDouble(state) as typeof fetch;

    const tarjetaId = crearCuentaDouble(state, {
      nombre: "Tarjeta Con Cupo",
      tipo: "Tarjeta de Crédito",
      saldoInicial: -400, // deuda actual $400
      fechaCorte: "2026-07-01T00:00:00.000Z",
      tcCupo: 500,
    });

    const movimiento = await crearMovimiento({
      tipo: "Egreso",
      origen: "Manual",
      categoria: "Otro",
      monto: 150, // deuda tras el movimiento = 400 + 150 = 550 > cupo 500
      cuentaOrigenId: tarjetaId,
      estado: "Confirmado",
      estadoDistribucion: "No aplica",
      fecha: "2026-07-15T12:00:00.000Z",
      observacion: "Consumo que excede el cupo",
      registradoPor: "Test",
    });

    assert(!!movimiento.id, "El Egreso que supera el cupo se crea igual — nunca se bloquea");
    assert(movimiento.alertaDescuadre === true, "Superar TC Cupo marca Alerta Descuadre = true");
    assert(state.movimientos.size === 1, "El movimiento quedó efectivamente registrado (1 registro en el store)");
  }

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — Alerta Descuadre en tarjetas: deuda normal nunca alerta, cupo excedido sí, y nunca bloquea.");
}

const fetchOriginal = global.fetch;
main();

/**
 * Test §9 #9, #16, #17 del diseño de Fase 20.5 — calcularEstadoTarjeta lanza
 * PreGoLiveError si la tarjeta no tiene Fecha de Corte (go-live) todavía; y
 * listarEstadosTarjetas (Corrección 2) captura ese error POR TARJETA sin
 * romper la lista completa, mientras que cualquier otro error real sí se
 * propaga (no se esconde un bug detrás del guard).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-5.4.pre-go-live.test.ts
 */

import { CUENTAS_FIELDS } from "../cuentas";
import { PreGoLiveError } from "../pre-go-live";
import { __resetCacheNombreTablaParaPruebas } from "../table-names";
import { calcularEstadoTarjeta, listarEstadosTarjetas } from "../tarjetas";
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

  // --- #9: calcularEstadoTarjeta lanza PreGoLiveError sin Fecha de Corte ---
  {
    __resetCacheNombreTablaParaPruebas();
    const state = crearEstadoDouble("Movimientos Financieros");
    global.fetch = construirFetchDouble(state) as typeof fetch;

    const tarjetaId = crearCuentaDouble(state, {
      nombre: "Tarjeta Sin Activar",
      tipo: "Tarjeta de Crédito",
      fechaCorte: null,
      tcDiaCorte: 5,
      tcDiaPago: 20,
    });

    let lanzoPreGoLive = false;
    try {
      await calcularEstadoTarjeta(tarjetaId);
    } catch (error) {
      lanzoPreGoLive = error instanceof PreGoLiveError;
    }
    assert(lanzoPreGoLive, "calcularEstadoTarjeta lanza PreGoLiveError cuando la tarjeta no tiene Fecha de Corte");
  }

  // --- #16: listarEstadosTarjetas no rompe la lista completa por una tarjeta sin go-live ---
  {
    __resetCacheNombreTablaParaPruebas();
    const state = crearEstadoDouble("Movimientos Financieros");
    global.fetch = construirFetchDouble(state) as typeof fetch;

    const activaId = crearCuentaDouble(state, {
      nombre: "Tarjeta Activa",
      tipo: "Tarjeta de Crédito",
      fechaCorte: "2026-07-01T00:00:00.000Z",
      saldoInicial: -100,
      tcDiaCorte: 5,
      tcDiaPago: 20,
    });
    const pendienteId = crearCuentaDouble(state, {
      nombre: "Tarjeta Pendiente",
      tipo: "Tarjeta de Crédito",
      fechaCorte: null,
      tcDiaCorte: 10,
      tcDiaPago: 25,
    });

    const resultados = await listarEstadosTarjetas(new Date(Date.UTC(2026, 6, 10)));
    assert(resultados.length === 2, `listarEstadosTarjetas devuelve las 2 tarjetas (obtenido: ${resultados.length})`);

    const activa = resultados.find((r) => r.cuentaId === activaId);
    const pendiente = resultados.find((r) => r.cuentaId === pendienteId);
    assert(!!activa && activa.disponible === true, "La tarjeta con go-live queda disponible: true, con su estado calculado");
    assert(!!pendiente && pendiente.disponible === false, "La tarjeta sin go-live queda disponible: false, sin romper la lista");
  }

  // --- #17: un error real (no PreGoLiveError) sí se propaga, no se esconde ---
  {
    // tablaMovimientosActiva con un nombre que NO está en NOMBRES_TABLA_MOVIMIENTOS
    // — ninguna de las dos tablas conocidas "existe" en el doble, así que
    // fetchMovimientosDeCuentaPorEstado (dentro de calcularEstadoTarjeta)
    // falla con un error real de resolución de tabla, distinto de
    // PreGoLiveError. Necesita al menos un id "colgado" en el inverso de la
    // cuenta para que la función no corte camino antes de intentar
    // resolver la tabla (sin ids, devuelve [] sin tocar red).
    __resetCacheNombreTablaParaPruebas();
    const state = crearEstadoDouble("Una Tabla Que No Es Movimientos Financieros");
    global.fetch = construirFetchDouble(state) as typeof fetch;

    const tarjetaId = crearCuentaDouble(state, {
      nombre: "Tarjeta Con Go-Live",
      tipo: "Tarjeta de Crédito",
      fechaCorte: "2026-07-01T00:00:00.000Z",
      tcDiaCorte: 5,
      tcDiaPago: 20,
    });
    state.cuentas.get(tarjetaId)!.fields[CUENTAS_FIELDS.movimientosOrigen] = ["recDANGLING0001"];

    let errorPropagado: unknown = null;
    try {
      await listarEstadosTarjetas(new Date(Date.UTC(2026, 6, 10)));
    } catch (error) {
      errorPropagado = error;
    }
    assert(errorPropagado !== null, "listarEstadosTarjetas propaga el error, no lo traga silenciosamente");
    assert(!(errorPropagado instanceof PreGoLiveError), "El error propagado NO es un PreGoLiveError (es un fallo real de resolución de tabla)");
  }

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — pre-go-live por tarjeta individual: captura selectiva y propagación de errores reales, correctas.");
}

const fetchOriginal = global.fetch;
main();

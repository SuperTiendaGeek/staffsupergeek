/**
 * Test §9 #12 del diseño de Fase 20.5 — no-regresión: un Movimiento Interno
 * hacia una tarjeta de crédito (pago del estado de cuenta) sigue bloqueando
 * por saldo insuficiente de la cuenta ORIGEN real (p. ej. SGCAPITAL) — la
 * política nueva de Alerta Descuadre de tarjetas (§4.2) NO afecta esta
 * validación, que sigue siendo la de 20.1: Movimiento Interno rechaza si no
 * hay saldo.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-5.6.movimiento-interno-hacia-tarjeta.test.ts
 */

import { crearMovimiento } from "../movimientos";
import { __resetCacheNombreTablaParaPruebas } from "../table-names";
import { activarEnvFalso, construirFetchDouble, crearCuentaDouble, crearEstadoDouble, limpiarEnvFalso, permitirTransferencia } from "./_airtableDouble";

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
  global.fetch = construirFetchDouble(state) as typeof fetch;

  const sgCapitalId = crearCuentaDouble(state, {
    nombre: "SGCAPITAL",
    tipo: "Final",
    saldoInicial: 100, // solo $100 disponibles
    fechaCorte: "2026-07-01T00:00:00.000Z",
  });
  const tarjetaId = crearCuentaDouble(state, {
    nombre: "Tarjeta A Pagar",
    tipo: "Tarjeta de Crédito",
    saldoInicial: -300, // debe $300
    fechaCorte: "2026-07-01T00:00:00.000Z",
  });
  permitirTransferencia(state, sgCapitalId, tarjetaId);

  let rechazado = false;
  try {
    await crearMovimiento({
      tipo: "Movimiento Interno",
      origen: "Manual",
      categoria: "Pago Tarjeta de Crédito",
      monto: 300, // más de lo que SGCAPITAL tiene disponible ($100)
      cuentaOrigenId: sgCapitalId,
      cuentaDestinoId: tarjetaId,
      estado: "Confirmado",
      estadoDistribucion: "No aplica",
      fecha: "2026-07-15T12:00:00.000Z",
      registradoPor: "Test",
    });
  } catch {
    rechazado = true;
  }

  assert(rechazado, "El Movimiento Interno hacia la tarjeta se rechaza cuando SGCAPITAL no tiene fondos suficientes");
  assert(state.movimientos.size === 0, "Ningún movimiento quedó registrado (rechazado antes de tocar Airtable)");

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — pagar una tarjeta sigue bloqueado por saldo insuficiente de la cuenta origen real.");
}

const fetchOriginal = global.fetch;
main();

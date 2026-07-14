/**
 * Test §9 #3 (Fase 20.3) — procesarAcreditacion(): flujo completo,
 * conservación de dólares. Réplica del Evento 4 de la prueba de fuego
 * (§8 del diseño): un Pendiente de $30 en Tránsito, neto $28.80 →
 * comisión $1.20. Verifica los 3 registros finales exactos y que
 * saldo(Tránsito) antes/después del flujo completo es $0.00 en ambos casos.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-3.3.procesarAcreditacion-flujo-completo.test.ts
 */

import { procesarAcreditacion } from "../acreditacion";
import { crearMovimiento } from "../movimientos";
import { calcularSaldoCuenta } from "../saldos";
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

  const transitoId = crearCuentaDouble(state, { nombre: "Tarjetas en Tránsito", tipo: "Tránsito", saldoInicial: 0, fechaCorte: "2026-01-01" });
  const sgIngresosId = crearCuentaDouble(state, { nombre: "SGINGRESOS", tipo: "Principal", saldoInicial: 0, fechaCorte: "2026-01-01" });
  permitirTransferencia(state, transitoId, sgIngresosId);

  const pendiente = await crearMovimiento({
    tipo: "Ingreso",
    origen: "Facturación",
    categoria: "Venta Mostrador",
    monto: 30,
    cuentaDestinoId: transitoId,
    estado: "Pendiente",
    fecha: "2026-07-15T10:00:00.000Z",
    registradoPor: "Test",
  });

  const saldoTransitoAntes = await calcularSaldoCuenta(transitoId);
  assert(saldoTransitoAntes === 0, `Saldo Tránsito antes de acreditar = $0.00 (Pendiente no cuenta, obtenido: $${saldoTransitoAntes})`);

  const resultado = await procesarAcreditacion(pendiente.id, {
    montoNeto: 28.8,
    fecha: "2026-07-17T10:00:00.000Z",
    registradoPor: "Admin Test",
  });

  assert(resultado.movimiento.estado === "Acreditado", "El original queda Acreditado");
  assert(resultado.movimiento.montoBruto === 30 && resultado.movimiento.montoNeto === 28.8 && resultado.movimiento.comision === 1.2, "Bruto/Neto/Comisión correctos en el original");

  assert(resultado.interno.tipo === "Movimiento Interno", "El Interno-hijo es de tipo Movimiento Interno");
  assert(resultado.interno.categoria === "Acreditación Pasarela", "El Interno-hijo usa la categoría Acreditación Pasarela");
  assert(resultado.interno.monto === 28.8, `El Interno-hijo mueve exactamente el neto (obtenido: $${resultado.interno.monto})`);
  assert(resultado.interno.cuentaOrigenId === transitoId && resultado.interno.cuentaDestinoId === sgIngresosId, "El Interno-hijo va de Tránsito a SGINGRESOS");
  assert(resultado.interno.estadoDistribucion === "No aplica", "El Interno-hijo es No aplica (reubicación de efectivo)");
  assert(resultado.interno.reversaAId === resultado.movimiento.id, "El Interno-hijo enlaza Reversa a → original");

  assert(resultado.ajuste !== null, "El Ajuste-hijo existe (comisión > 0)");
  assert(resultado.ajuste!.tipo === "Ajuste", "El Ajuste-hijo es de tipo Ajuste");
  assert(resultado.ajuste!.monto === 1.2, `El Ajuste-hijo es exactamente la comisión (obtenido: $${resultado.ajuste!.monto})`);
  assert(resultado.ajuste!.cuentaOrigenId === transitoId && !resultado.ajuste!.cuentaDestinoId, "El Ajuste-hijo sale de Tránsito, sin Cuenta Destino");
  assert(resultado.ajuste!.rubros.utilidad === 1.2, "El Ajuste-hijo clasifica su rubro: Utilidad = comisión");
  assert(resultado.ajuste!.estadoDistribucion === "Distribuido", "El Ajuste-hijo queda Distribuido");
  assert(resultado.ajuste!.reversaAId === resultado.movimiento.id, "El Ajuste-hijo enlaza Reversa a → original");

  const saldoTransitoDespues = await calcularSaldoCuenta(transitoId);
  const saldoSgIngresos = await calcularSaldoCuenta(sgIngresosId);
  assert(saldoTransitoDespues === 0, `Saldo Tránsito después = $0.00, sin residuo (obtenido: $${saldoTransitoDespues})`);
  assert(saldoSgIngresos === 28.8, `Saldo SGINGRESOS sube exactamente el neto (obtenido: $${saldoSgIngresos})`);

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — procesarAcreditacion conserva los dólares exactamente.");
}

const fetchOriginal = global.fetch;
main();

/**
 * Test §9 #21 del diseño de Fase 20.5 — la alerta de pago próximo
 * (estaEnVentanaDeAlerta) aparece cuando diasHastaPago <= N y
 * saldoUltimoCorte > 0, y desaparece sola en el siguiente cálculo tras
 * registrar el pago completo — sin ningún estado que limpiar a mano, es
 * consecuencia directa del cálculo en vivo (§3 del diseño).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-5.11.alerta-pago-proximo.test.ts
 */

import { crearMovimiento } from "../movimientos";
import { __resetCacheNombreTablaParaPruebas } from "../table-names";
import { DIAS_ALERTA_PAGO_TARJETA, estaEnVentanaDeAlerta, listarEstadosTarjetas } from "../tarjetas";
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
  const sgCapitalId = crearCuentaDouble(state, { nombre: "SGCAPITAL", tipo: "Final", saldoInicial: 500, fechaCorte: "2026-06-25T00:00:00.000Z" });
  const tarjetaId = crearCuentaDouble(state, {
    nombre: "Tarjeta Alerta",
    tipo: "Tarjeta de Crédito",
    saldoInicial: -200,
    fechaCorte: "2026-06-25T00:00:00.000Z",
    tcDiaCorte: 5,
    tcDiaPago: 20,
  });
  permitirTransferencia(state, sgCapitalId, tarjetaId);
  global.fetch = construirFetchDouble(state) as typeof fetch;

  const hoy = new Date(Date.UTC(2026, 6, 18)); // 18 jul — 2 días antes del pago del 20 jul, dentro de N=3

  const resultadosAntes = await listarEstadosTarjetas(hoy);
  const tarjetaAntes = resultadosAntes.find((r) => r.cuentaId === tarjetaId)!;
  assert(tarjetaAntes.disponible === true, "La tarjeta está disponible (go-live hecho)");
  assert(tarjetaAntes.disponible && tarjetaAntes.estado.diasHastaPago === 2, `diasHastaPago = 2 (obtenido: ${tarjetaAntes.disponible ? tarjetaAntes.estado.diasHastaPago : "N/A"})`);
  assert(tarjetaAntes.disponible && tarjetaAntes.estado.saldoUltimoCorte === 200, `saldoUltimoCorte = $200 (obtenido: $${tarjetaAntes.disponible ? tarjetaAntes.estado.saldoUltimoCorte : "N/A"})`);
  assert(estaEnVentanaDeAlerta(tarjetaAntes), `La alerta está activa (diasHastaPago=2 <= N=${DIAS_ALERTA_PAGO_TARJETA}, saldoUltimoCorte=$200 > 0)`);

  // Pago completo del estado de cuenta.
  await crearMovimiento({
    tipo: "Movimiento Interno",
    origen: "Manual",
    categoria: "Pago Tarjeta de Crédito",
    monto: 200,
    cuentaOrigenId: sgCapitalId,
    cuentaDestinoId: tarjetaId,
    estado: "Confirmado",
    estadoDistribucion: "No aplica",
    fecha: "2026-07-18T12:00:00.000Z",
    registradoPor: "Test",
  });

  const resultadosDespues = await listarEstadosTarjetas(hoy);
  const tarjetaDespues = resultadosDespues.find((r) => r.cuentaId === tarjetaId)!;
  assert(tarjetaDespues.disponible && tarjetaDespues.estado.saldoUltimoCorte === 0, `saldoUltimoCorte = $0 tras el pago (obtenido: $${tarjetaDespues.disponible ? tarjetaDespues.estado.saldoUltimoCorte : "N/A"})`);
  assert(!estaEnVentanaDeAlerta(tarjetaDespues), "La alerta desaparece sola en el siguiente cálculo, sin ningún estado que limpiar a mano");

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — la alerta de pago próximo aparece y desaparece correctamente según el cálculo en vivo.");
}

const fetchOriginal = global.fetch;
main();

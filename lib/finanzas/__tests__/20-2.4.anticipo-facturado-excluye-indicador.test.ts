/**
 * Test §7 #4 (Fase 20.2) — Anticipo→facturado excluye del indicador: un
 * abono nuevo aparece en calcularAnticiposSinFacturar(); al marcarse como
 * facturado (lo que hace el Puente 2(b) vía actualizarMovimiento — probado
 * por separado en el test #9), deja de aparecer, sin tocar el código de
 * calcularAnticiposSinFacturar (ya construido en la Fase 20.1).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-2.4.anticipo-facturado-excluye-indicador.test.ts
 */

import { crearMovimientoParaAbono } from "../puentes/abonos";
import { actualizarMovimiento } from "../movimientos";
import { calcularAnticiposSinFacturar } from "../saldos";
import { __resetCacheNombreTablaParaPruebas } from "../table-names";
import { activarEnvFalso, construirFetchDouble, crearCuentaDouble, crearEstadoDouble, crearRegistroDouble, limpiarEnvFalso } from "./_airtableDouble";

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

  crearCuentaDouble(state, { nombre: "Caja Registradora", fechaCorte: "2026-01-01" });
  const abonoId = crearRegistroDouble(state, "Abonos", { Monto: 80, "Método de Pago": "Efectivo" });
  crearRegistroDouble(state, "Facturas Electrónicas", { "Número de Factura": "001-001-000000001" });

  const creado = await crearMovimientoParaAbono({
    abonoId,
    monto: 80,
    metodoPago: "Efectivo",
    fecha: "2026-07-12T10:00:00.000Z",
    registradoPor: "Test",
  });
  if (!creado.ok) throw new Error("Setup falló: no se pudo crear el movimiento del abono");

  const antesDeFacturar = await calcularAnticiposSinFacturar();
  assert(antesDeFacturar === 80, `Antes de facturar, el indicador incluye el anticipo ($80, obtenido: $${antesDeFacturar})`);

  await actualizarMovimiento(creado.movimientoId, {
    facturaElectronicaId: "rec0000000000001",
    estadoDistribucion: "Pendiente de clasificar",
  });

  const despuesDeFacturar = await calcularAnticiposSinFacturar();
  assert(despuesDeFacturar === 0, `Después de facturar, el indicador ya no lo incluye (obtenido: $${despuesDeFacturar})`);

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — anticipo facturado excluye del indicador sin tocar su código.");
}

const fetchOriginal = global.fetch;
main();

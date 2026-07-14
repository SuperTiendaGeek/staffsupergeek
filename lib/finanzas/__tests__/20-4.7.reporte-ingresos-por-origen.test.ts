/**
 * Test §7 #7 (Fase 20.4) — calcularReporteDiario(): Ingresos por origen de
 * negocio. Venta Mostrador/Servicio Reparación/Venta Producto van directo a
 * su bucket sin pasar por la resolución de Abono. Anticipo Cliente se
 * resuelve vía el Abono: solo Orden → Órdenes; solo Operación → Operaciones;
 * ambos → Órdenes (precedencia); sin Abono resoluble → Otros, sin lanzar.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-4.7.reporte-ingresos-por-origen.test.ts
 */

import { calcularReporteDiario } from "../reporte";
import { crearMovimiento } from "../movimientos";
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

const FECHA = "2026-07-20T10:00:00.000Z";
const DESDE = "2026-07-20T00:00:00.000";
const HASTA = "2026-07-21T00:00:00.000";

async function main() {
  activarEnvFalso();
  __resetCacheNombreTablaParaPruebas();
  const state = crearEstadoDouble("Movimientos Financieros");
  const cajaId = crearCuentaDouble(state, { nombre: "Caja Registradora", fechaCorte: "2026-01-01" });
  global.fetch = construirFetchDouble(state) as typeof fetch;

  const abonoOrden = crearRegistroDouble(state, "Abonos", { "Aplicado a: Orden": ["recOrden001"] });
  const abonoOperacion = crearRegistroDouble(state, "Abonos", { "Aplicado a: Operación": ["recOperacion001"] });
  const abonoAmbos = crearRegistroDouble(state, "Abonos", { "Aplicado a: Orden": ["recOrden002"], "Aplicado a: Operación": ["recOperacion002"] });
  const abonoSinResolucion = crearRegistroDouble(state, "Abonos", {});

  await crearMovimiento({ tipo: "Ingreso", origen: "Facturación", categoria: "Venta Mostrador", monto: 30, cuentaDestinoId: cajaId, estado: "Confirmado", fecha: FECHA, registradoPor: "Test" });
  await crearMovimiento({ tipo: "Ingreso", origen: "Facturación", categoria: "Servicio Reparación", monto: 40, cuentaDestinoId: cajaId, estado: "Confirmado", fecha: FECHA, registradoPor: "Test" });
  await crearMovimiento({ tipo: "Ingreso", origen: "Facturación", categoria: "Venta Producto", monto: 50, cuentaDestinoId: cajaId, estado: "Confirmado", fecha: FECHA, registradoPor: "Test" });
  await crearMovimiento({ tipo: "Ingreso", origen: "Abonos", categoria: "Anticipo Cliente", monto: 20, cuentaDestinoId: cajaId, estado: "Confirmado", estadoDistribucion: "Sin distribuir", fecha: FECHA, registradoPor: "Test", abonoId: abonoOrden });
  await crearMovimiento({ tipo: "Ingreso", origen: "Abonos", categoria: "Anticipo Cliente", monto: 25, cuentaDestinoId: cajaId, estado: "Confirmado", estadoDistribucion: "Sin distribuir", fecha: FECHA, registradoPor: "Test", abonoId: abonoOperacion });
  await crearMovimiento({ tipo: "Ingreso", origen: "Abonos", categoria: "Anticipo Cliente", monto: 15, cuentaDestinoId: cajaId, estado: "Confirmado", estadoDistribucion: "Sin distribuir", fecha: FECHA, registradoPor: "Test", abonoId: abonoAmbos });
  await crearMovimiento({ tipo: "Ingreso", origen: "Abonos", categoria: "Anticipo Cliente", monto: 10, cuentaDestinoId: cajaId, estado: "Confirmado", estadoDistribucion: "Sin distribuir", fecha: FECHA, registradoPor: "Test", abonoId: abonoSinResolucion });
  await crearMovimiento({ tipo: "Ingreso", origen: "Abonos", categoria: "Anticipo Cliente", monto: 5, cuentaDestinoId: cajaId, estado: "Confirmado", estadoDistribucion: "Sin distribuir", fecha: FECHA, registradoPor: "Test", abonoId: "recAbonoInexistente0" });

  const reporte = await calcularReporteDiario({ desde: DESDE, hasta: HASTA });

  assert(reporte.ingresos.total === 195, `Total de ingresos = $195 (obtenido: $${reporte.ingresos.total})`);
  assert(reporte.ingresos.porOrigenNegocio.mostrador === 30, `Mostrador = $30 (obtenido: $${reporte.ingresos.porOrigenNegocio.mostrador})`);
  assert(reporte.ingresos.porOrigenNegocio.ordenes === 75, `Órdenes = $75 (Servicio Reparación $40 + anticipo-orden $20 + anticipo-ambos $15, obtenido: $${reporte.ingresos.porOrigenNegocio.ordenes})`);
  assert(reporte.ingresos.porOrigenNegocio.operaciones === 75, `Operaciones = $75 (Venta Producto $50 + anticipo-operación $25, obtenido: $${reporte.ingresos.porOrigenNegocio.operaciones})`);
  assert(reporte.ingresos.porOrigenNegocio.otros === 15, `Otros = $15 (sin Abono resoluble $10 + Abono inexistente $5, obtenido: $${reporte.ingresos.porOrigenNegocio.otros})`);

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — desglose de ingresos por origen de negocio correcto.");
}

const fetchOriginal = global.fetch;
main();

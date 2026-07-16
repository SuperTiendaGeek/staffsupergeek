/**
 * Test §9 #6-#7 del diseño de Fase 20.5 — calcularEstadoTarjetaPuro: el
 * saldo del último corte refleja correctamente pagos parciales sin ningún
 * término extra (§3.3 del diseño), y consumosPeriodoEnCurso excluye
 * exactamente lo anterior al corte más reciente.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-5.2.saldo-ultimo-corte-y-consumos.test.ts
 *
 * Puro, sin red — construye Movimiento[] a mano, sin pasar por Airtable.
 */

import type { Movimiento } from "@/types/finanzas";
import { calcularEstadoTarjetaPuro } from "../tarjetas";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

function mov(overrides: Partial<Movimiento>): Movimiento {
  return {
    id: overrides.id ?? "recMOV",
    movimientoId: "MOV-TEST",
    origen: "Manual",
    tipo: "Egreso",
    categoria: "Otro",
    estado: "Confirmado",
    estadoDistribucion: "No aplica",
    cuentaOrigenId: null,
    cuentaDestinoId: null,
    monto: 0,
    rubros: { capital: 0, utilidad: 0, iva: 0, repuestoExterno: 0 },
    alertaDescuadre: false,
    fecha: "",
    montoBruto: null,
    montoNeto: null,
    comision: null,
    abonoIds: [],
    facturaElectronicaIds: [],
    horariosPagoIds: [],
    clienteIds: [],
    proveedorIds: [],
    pagoShippingIds: [],
    reversaAId: null,
    compensadoPorIds: [],
    cuadreDeCajaId: null,
    ...overrides,
  };
}

const TARJETA = { id: "recTARJETA1", tcDiaCorte: 5, tcDiaPago: 20, tcCupo: null };

// #6 — factura $100 en el corte; pago parcial $30 después; consumo nuevo $15 después del pago.
// deudaActual final = 100 - 30 + 15 = 85 (saldoActual = -85).
{
  const hoy = new Date(Date.UTC(2026, 6, 10)); // 10 jul 2026, corte más reciente = 5 jul
  const movimientos = [mov({ id: "recA", tipo: "Egreso", cuentaOrigenId: TARJETA.id, monto: 15, fecha: "2026-07-08T00:00:00.000Z" })];
  const estado = calcularEstadoTarjetaPuro(TARJETA, -85, movimientos, hoy);
  assert(estado.deudaActual === 85, `deudaActual = 85 (obtenido: ${estado.deudaActual})`);
  assert(estado.consumosPeriodoEnCurso === 15, `consumosPeriodoEnCurso = 15 (obtenido: ${estado.consumosPeriodoEnCurso})`);
  assert(estado.saldoUltimoCorte === 70, `saldoUltimoCorte = 70 — el pago parcial ya está reflejado (obtenido: ${estado.saldoUltimoCorte})`);
}

// #7 — un consumo justo antes del corte y otro justo después: solo el segundo cuenta como "período en curso".
{
  const hoy = new Date(Date.UTC(2026, 6, 10)); // corte más reciente = 5 jul, 00:00 UTC
  const movimientos = [
    mov({ id: "recAntes", tipo: "Egreso", cuentaOrigenId: TARJETA.id, monto: 40, fecha: "2026-07-04T23:00:00.000Z" }), // antes del corte
    mov({ id: "recDespues", tipo: "Egreso", cuentaOrigenId: TARJETA.id, monto: 25, fecha: "2026-07-06T01:00:00.000Z" }), // después del corte
  ];
  const estado = calcularEstadoTarjetaPuro(TARJETA, -65, movimientos, hoy);
  assert(estado.consumosPeriodoEnCurso === 25, `Solo el consumo posterior al corte cuenta como período en curso (obtenido: ${estado.consumosPeriodoEnCurso})`);
  assert(estado.saldoUltimoCorte === 40, `saldoUltimoCorte = 65 - 25 = 40 (obtenido: ${estado.saldoUltimoCorte})`);
}

if (fallos > 0) {
  console.error(`\n${fallos} fallo(s).`);
  process.exit(1);
}
console.log("\nOK — saldoUltimoCorte y consumosPeriodoEnCurso se calculan correctamente con pagos parciales y bordes de corte.");

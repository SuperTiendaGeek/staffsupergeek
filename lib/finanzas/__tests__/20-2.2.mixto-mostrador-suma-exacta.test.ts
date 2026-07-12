/**
 * Test §7 #2 (Fase 20.2) — Mixto suma exacta: factura de mostrador con
 * pagos de dos componentes crea un movimiento por componente, y la suma de
 * esos movimientos es igual al total de la factura.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-2.2.mixto-mostrador-suma-exacta.test.ts
 */

import { procesarPuenteFacturacion } from "../puentes/facturacion";
import { __resetCacheNombreTablaParaPruebas } from "../table-names";
import { activarEnvFalso, construirFetchDouble, crearCuentaDouble, crearEstadoDouble, limpiarEnvFalso } from "./_airtableDouble";
import type { DatosVenta, ResultadoEmision } from "@/lib/facturacion/emitirFactura";

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
  crearCuentaDouble(state, { nombre: "Tarjetas en Tránsito", tipo: "Tránsito", fechaCorte: "2026-01-01" });

  const resultado: ResultadoEmision = {
    estado: "AUTORIZADO",
    claveAcceso: "clave-test",
    numeroFactura: "001-001-000000001",
    recordId: "recFACTURA001",
    ambiente: "2",
  };
  const body = {
    pagos: [
      { formaPago: "01", total: 45 },
      { formaPago: "19", total: 30 },
    ],
    // resto de campos de DatosVenta no usados por el puente en mostrador
  } as unknown as DatosVenta;

  await procesarPuenteFacturacion(resultado, body, "Test");

  assert(state.movimientos.size === 2, `Se crean exactamente 2 movimientos, uno por componente (obtenido: ${state.movimientos.size})`);
  const montos = [...state.movimientos.values()].map((m) => m.fields["Monto"] as number).sort((a, b) => a - b);
  assert(montos[0] === 30 && montos[1] === 45, `Los montos son 30 y 45 (obtenido: ${JSON.stringify(montos)})`);
  const suma = montos.reduce((a, b) => a + b, 0);
  assert(suma === 75, `La suma de los movimientos = total de la factura ($75, obtenido: $${suma})`);

  const todasFacturadas = [...state.movimientos.values()].every(
    (m) => (m.fields["Factura Electrónica"] as string[])?.[0] === "recFACTURA001"
  );
  assert(todasFacturadas, "Ambos movimientos quedan vinculados a la Factura Electrónica");

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — pago mixto de mostrador crea un movimiento por componente, suma exacta.");
}

const fetchOriginal = global.fetch;
main();

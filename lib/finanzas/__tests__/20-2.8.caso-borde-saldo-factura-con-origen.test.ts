/**
 * Test §7 #8 (Fase 20.2) — Caso borde "saldo" en factura con origen: una
 * cuenta unificada con abonos que cubren solo una parte del total genera
 * exactamente un movimiento de ingreso nuevo por el remanente
 * (`origenPago: "saldo"`), mientras los abonos existentes solo se
 * actualizan (marcados como facturados, nunca duplicados).
 *
 * getCuentaUnificada() (lib/cuenta-unificada) hace sus propios fetch()
 * directos a Airtable — el doble de global.fetch los intercepta igual que
 * a los del resto del módulo finanzas, sin mocks adicionales.
 *
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-2.8.caso-borde-saldo-factura-con-origen.test.ts
 */

import { crearMovimientoParaAbono } from "../puentes/abonos";
import { procesarPuenteFacturacion } from "../puentes/facturacion";
import { __resetCacheNombreTablaParaPruebas } from "../table-names";
import { activarEnvFalso, construirFetchDouble, crearCuentaDouble, crearEstadoDouble, crearRegistroDouble, limpiarEnvFalso } from "./_airtableDouble";
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

  // Dos abonos vigentes ($50 + $30 = $80) ya con su movimiento (Puente 1).
  const abono1Id = crearRegistroDouble(state, "Abonos", {
    "ID Abono": 1,
    Monto: 50,
    "Método de Pago": "Efectivo",
    "Fecha de Abono": "2026-07-10T10:00:00.000Z",
    "Estado del Abono": "Registrado",
  });
  const abono2Id = crearRegistroDouble(state, "Abonos", {
    "ID Abono": 2,
    Monto: 30,
    "Método de Pago": "Efectivo",
    "Fecha de Abono": "2026-07-11T10:00:00.000Z",
    "Estado del Abono": "Registrado",
  });
  const mov1 = await crearMovimientoParaAbono({ abonoId: abono1Id, monto: 50, metodoPago: "Efectivo", fecha: "2026-07-10T10:00:00.000Z", registradoPor: "Test" });
  const mov2 = await crearMovimientoParaAbono({ abonoId: abono2Id, monto: 30, metodoPago: "Efectivo", fecha: "2026-07-11T10:00:00.000Z", registradoPor: "Test" });
  if (!mov1.ok || !mov2.ok) throw new Error("Setup falló creando movimientos de abonos");
  assert(state.movimientos.size === 2, "Hay 2 movimientos antes de facturar (uno por abono)");

  // Operación Comercial con los 2 abonos vigentes vinculados, sin Orden.
  const operacionId = crearRegistroDouble(state, "Operación Comercial", {
    "Orden de Reparación": [],
    "Artículo físico": [],
    Abonos: [abono1Id, abono2Id],
  });
  const facturaId = crearRegistroDouble(state, "Facturas Electrónicas", { "Número de Factura": "001-001-000000099" });

  const resultado: ResultadoEmision = {
    estado: "AUTORIZADO",
    claveAcceso: "clave-test",
    numeroFactura: "001-001-000000099",
    recordId: facturaId,
    ambiente: "2",
  };
  const body = {
    origen: { tipo: "operacion", recordId: operacionId },
    clienteRecordId: undefined,
    pagos: [
      { formaPago: "01", total: 50, origenPago: "abono" },
      { formaPago: "01", total: 30, origenPago: "abono" },
      { formaPago: "01", total: 20, origenPago: "saldo" },
    ],
  } as unknown as DatosVenta;

  await procesarPuenteFacturacion(resultado, body, "Test");

  assert(state.movimientos.size === 3, `Hay exactamente 3 movimientos tras facturar: 2 actualizados + 1 nuevo por el saldo (obtenido: ${state.movimientos.size})`);

  const movimiento1Actualizado = state.movimientos.get(mov1.movimientoId)!;
  const movimiento2Actualizado = state.movimientos.get(mov2.movimientoId)!;
  assert(
    (movimiento1Actualizado.fields["Factura Electrónica"] as string[])?.[0] === facturaId,
    "El movimiento del abono 1 queda vinculado a la factura"
  );
  assert(
    (movimiento2Actualizado.fields["Factura Electrónica"] as string[])?.[0] === facturaId,
    "El movimiento del abono 2 queda vinculado a la factura"
  );
  assert(
    movimiento1Actualizado.fields["Estado Distribución"] === "Pendiente de clasificar" &&
      movimiento2Actualizado.fields["Estado Distribución"] === "Pendiente de clasificar",
    "Ambos movimientos de abono transicionan a Pendiente de clasificar"
  );
  assert(movimiento1Actualizado.fields["Monto"] === 50 && movimiento2Actualizado.fields["Monto"] === 30, "Los montos de los abonos no se alteraron (inmutables)");

  const nuevoMovimientoSaldo = [...state.movimientos.values()].find(
    (m) => m.id !== mov1.movimientoId && m.id !== mov2.movimientoId
  );
  assert(!!nuevoMovimientoSaldo, "Existe un movimiento nuevo distinto de los 2 de abonos");
  assert(nuevoMovimientoSaldo?.fields["Monto"] === 20, `El movimiento nuevo es exactamente por el remanente ($20, obtenido: $${nuevoMovimientoSaldo?.fields["Monto"]})`);
  assert(nuevoMovimientoSaldo?.fields["Categoría"] === "Venta Producto", "El movimiento del saldo usa la categoría correcta (operación → Venta Producto)");

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — caso borde \"saldo\" en factura con origen manejado correctamente.");
}

const fetchOriginal = global.fetch;
main();

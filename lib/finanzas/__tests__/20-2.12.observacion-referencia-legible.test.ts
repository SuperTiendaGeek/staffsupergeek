/**
 * Test §7 #12 (Fase 20.2, Corrección 3) — Observación con referencia
 * legible: crearMovimientoParaAbono() escribe en Observación una
 * referencia legible al origen del abono ("Abono sobre Orden #X",
 * "Abono sobre Operación #Y", o la combinación de ambos), y si el abono
 * trae su propia observación, la antepone sin perderla.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-2.12.observacion-referencia-legible.test.ts
 */

import { MOVIMIENTOS_FIELDS } from "../movimientos-fields";
import { crearMovimientoParaAbono } from "../puentes/abonos";
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

  // Caso 1: abono aplicado solo a una Orden.
  const ordenId = crearRegistroDouble(state, "Órdenes de Reparación", { ID: "1042", Cliente: [] });
  const abonoOrdenId = crearRegistroDouble(state, "Abonos", {
    Monto: 50,
    "Método de Pago": "Efectivo",
    "Aplicado a: Orden": [ordenId],
  });
  const r1 = await crearMovimientoParaAbono({ abonoId: abonoOrdenId, monto: 50, metodoPago: "Efectivo", fecha: "2026-07-12T10:00:00.000Z", registradoPor: "Test" });
  if (!r1.ok) throw new Error("Setup falló (caso 1)");
  const mov1 = state.movimientos.get(r1.movimientoId)!;
  assert(
    mov1.fields[MOVIMIENTOS_FIELDS.observacion] === "Abono sobre Orden #1042",
    `Solo Orden → "Abono sobre Orden #1042" (obtenido: "${mov1.fields[MOVIMIENTOS_FIELDS.observacion]}")`
  );

  // Caso 2: abono aplicado solo a una Operación.
  const operacionId = crearRegistroDouble(state, "Operación Comercial", { "Código Operación": "OP-77", Cliente: [] });
  const abonoOperacionId = crearRegistroDouble(state, "Abonos", {
    Monto: 30,
    "Método de Pago": "Efectivo",
    "Aplicado a: Operación": [operacionId],
  });
  const r2 = await crearMovimientoParaAbono({ abonoId: abonoOperacionId, monto: 30, metodoPago: "Efectivo", fecha: "2026-07-12T10:00:00.000Z", registradoPor: "Test" });
  if (!r2.ok) throw new Error("Setup falló (caso 2)");
  const mov2 = state.movimientos.get(r2.movimientoId)!;
  assert(
    mov2.fields[MOVIMIENTOS_FIELDS.observacion] === "Abono sobre Operación #OP-77",
    `Solo Operación → "Abono sobre Operación #OP-77" (obtenido: "${mov2.fields[MOVIMIENTOS_FIELDS.observacion]}")`
  );

  // Caso 3: abono aplicado a Orden Y Operación a la vez — combina ambas.
  const ordenId2 = crearRegistroDouble(state, "Órdenes de Reparación", { ID: "1099", Cliente: [] });
  const operacionId2 = crearRegistroDouble(state, "Operación Comercial", { "Código Operación": "OP-88", Cliente: [] });
  const abonoAmbosId = crearRegistroDouble(state, "Abonos", {
    Monto: 20,
    "Método de Pago": "Efectivo",
    "Aplicado a: Orden": [ordenId2],
    "Aplicado a: Operación": [operacionId2],
  });
  const r3 = await crearMovimientoParaAbono({ abonoId: abonoAmbosId, monto: 20, metodoPago: "Efectivo", fecha: "2026-07-12T10:00:00.000Z", registradoPor: "Test" });
  if (!r3.ok) throw new Error("Setup falló (caso 3)");
  const mov3 = state.movimientos.get(r3.movimientoId)!;
  assert(
    mov3.fields[MOVIMIENTOS_FIELDS.observacion] === "Abono sobre Orden #1099 (Operación #OP-88)",
    `Orden + Operación → combinados (obtenido: "${mov3.fields[MOVIMIENTOS_FIELDS.observacion]}")`
  );

  // Caso 4: el abono trae su propia observación — se antepone la referencia sin perder el texto original.
  const ordenId3 = crearRegistroDouble(state, "Órdenes de Reparación", { ID: "1123", Cliente: [] });
  const abonoConObservacionId = crearRegistroDouble(state, "Abonos", {
    Monto: 15,
    "Método de Pago": "Efectivo",
    "Aplicado a: Orden": [ordenId3],
  });
  const r4 = await crearMovimientoParaAbono({
    abonoId: abonoConObservacionId,
    monto: 15,
    metodoPago: "Efectivo",
    fecha: "2026-07-12T10:00:00.000Z",
    registradoPor: "Test",
    observacion: "Cliente pidió factura a nombre de un tercero",
  });
  if (!r4.ok) throw new Error("Setup falló (caso 4)");
  const mov4 = state.movimientos.get(r4.movimientoId)!;
  assert(
    mov4.fields[MOVIMIENTOS_FIELDS.observacion] === "Abono sobre Orden #1123 — Cliente pidió factura a nombre de un tercero",
    `Con observación propia → referencia antepuesta, texto original conservado (obtenido: "${mov4.fields[MOVIMIENTOS_FIELDS.observacion]}")`
  );

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — Observación con referencia legible al origen, en los 4 casos.");
}

const fetchOriginal = global.fetch;
main();

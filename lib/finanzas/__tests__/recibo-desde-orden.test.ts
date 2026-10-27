/**
 * Test — puente contable del RECIBO emitido desde una orden/operación.
 *
 * La regla que protege: una orden que ya tenía abonos cobrados NO puede
 * volver a registrar ese dinero al cerrarse con recibo. Los abonos ya están
 * en /finanzas (puente de Abonos); el recibo solo los marca como
 * documentados. Desde el punto 1 de la auditoría ops (27-oct-2026) la cuenta
 * llega pagada con abonos y lo único nuevo es la venta adicional, que entra
 * con su cuenta. Anular no devuelve los abonos.
 *
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/recibo-desde-orden.test.ts
 */

import { crearMovimientoParaAbono } from "../puentes/abonos";
import { procesarPuenteRecibo, revertirPuenteRecibo } from "../puentes/recibo";
import { __resetCacheNombreTablaParaPruebas } from "../table-names";
import { activarEnvFalso, construirFetchDouble, crearCuentaDouble, crearEstadoDouble, crearRegistroDouble, limpiarEnvFalso } from "./_airtableDouble";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

async function main() {
  activarEnvFalso();
  __resetCacheNombreTablaParaPruebas();
  const state = crearEstadoDouble("Movimientos Financieros");
  global.fetch = construirFetchDouble(state) as typeof fetch;

  const caja = crearCuentaDouble(state, { nombre: "Caja Registradora", fechaCorte: "2026-01-01" });
  const deuna = crearCuentaDouble(state, { nombre: "DeUna", fechaCorte: "2026-01-01" });

  // Orden con dos abonos vigentes ($50 + $30 = $80), cada uno ya con su
  // movimiento creado por el puente de Abonos. La cuenta es de $80: llega
  // PAGADA al emitir (la emisión lo exige desde el punto 1 de la auditoría).
  const abono1Id = crearRegistroDouble(state, "Abonos", {
    "ID Abono": 1, Monto: 50, "Método de Pago": "Efectivo",
    "Fecha de Abono": "2026-09-10T10:00:00.000Z", "Estado del Abono": "Registrado",
  });
  const abono2Id = crearRegistroDouble(state, "Abonos", {
    "ID Abono": 2, Monto: 30, "Método de Pago": "Efectivo",
    "Fecha de Abono": "2026-09-11T10:00:00.000Z", "Estado del Abono": "Registrado",
  });
  const mov1 = await crearMovimientoParaAbono({ abonoId: abono1Id, monto: 50, metodoPago: "Efectivo", fecha: "2026-09-10T10:00:00.000Z", registradoPor: "Test" });
  const mov2 = await crearMovimientoParaAbono({ abonoId: abono2Id, monto: 30, metodoPago: "Efectivo", fecha: "2026-09-11T10:00:00.000Z", registradoPor: "Test" });
  if (!mov1.ok || !mov2.ok) throw new Error("Setup falló creando movimientos de abonos");
  assert(state.movimientos.size === 2, "Hay 2 movimientos antes de emitir el recibo (uno por abono)");

  const operacionId = crearRegistroDouble(state, "Operación Comercial", {
    "Orden de Reparación": [], "Artículo físico": [], Abonos: [abono1Id, abono2Id],
  });
  const reciboId = crearRegistroDouble(state, "Recibos", { "Número": "REC-000042", Estado: "Vigente", Total: 100 });

  // Recibo por $100 = cuenta $80 (pagada con abonos) + venta adicional $20
  // cobrada al emitir: $15 en efectivo y $5 por DeUna.
  const resultado = await procesarPuenteRecibo({
    reciboRecordId: reciboId, numeroRecibo: "REC-000042",
    origen: { tipo: "operacion", recordId: operacionId },
    pagosAdicionales: [
      { metodoPago: "Efectivo", total: 15 },
      { metodoPago: "DeUna", total: 5, referencia: "DU-998" },
    ],
    registradoPor: "Test", ambiente: "2",
  });

  assert(resultado.estado === "OK", `El puente termina OK (obtenido: ${resultado.estado}${resultado.detalle ? " — " + resultado.detalle : ""})`);
  assert(resultado.abonosMarcados === 2, `Se marcaron los 2 abonos (obtenido: ${resultado.abonosMarcados})`);
  assert(resultado.adicionalRegistrado === 20, `Solo la venta adicional ($20) es ingreso nuevo (obtenido: $${resultado.adicionalRegistrado})`);
  assert(state.movimientos.size === 4, `Hay 4 movimientos: 2 de abonos + 2 de la venta adicional (obtenido: ${state.movimientos.size})`);

  const m1 = state.movimientos.get(mov1.movimientoId)!;
  const m2 = state.movimientos.get(mov2.movimientoId)!;
  assert((m1.fields["Recibo"] as string[])?.[0] === reciboId && (m2.fields["Recibo"] as string[])?.[0] === reciboId,
    "Los movimientos de los abonos quedan vinculados al recibo");
  assert(m1.fields["Monto"] === 50 && m2.fields["Monto"] === 30, "Los montos de los abonos no se alteraron");

  const nuevos = [...state.movimientos.values()].filter((m) => m.id !== mov1.movimientoId && m.id !== mov2.movimientoId);
  const efectivo = nuevos.find((m) => m.fields["Monto"] === 15);
  const pagoDeUna = nuevos.find((m) => m.fields["Monto"] === 5);
  assert((efectivo?.fields["Cuenta Destino (Finanzas)"] as string[])?.[0] === caja, "El cobro adicional en efectivo entra a Caja Registradora");
  assert((pagoDeUna?.fields["Cuenta Destino (Finanzas)"] as string[])?.[0] === deuna, "El cobro adicional por DeUna entra a la cuenta DeUna (no a SGINGRESOS)");
  assert(pagoDeUna?.fields["Transacción ID"] === "DU-998", "El número de transacción de DeUna queda en el movimiento");
  assert(nuevos.every((m) => m.fields["Categoría"] === "Venta Mostrador"), "La venta adicional va a Venta Mostrador");
  assert(nuevos.every((m) => (m.fields["Recibo"] as string[])?.[0] === reciboId), "Los movimientos de la venta adicional quedan vinculados al recibo");
  assert(!nuevos.some((m) => String(m.fields["Observación"] ?? "").includes("saldo cobrado al emitir")), 'Ya no existe el movimiento "saldo cobrado al emitir" (caso OR000510)');

  // ─── Anulación: los abonos se quedan en la orden; se revierte lo adicional ─
  const reciboRecord = state.otras.get("Recibos")!.get(reciboId)!;
  const movimientoIds = (reciboRecord.fields["Movimientos Financieros"] as string[] | undefined) ?? [];
  assert(movimientoIds.length === 4, `El recibo quedó enlazado a los 4 movimientos (obtenido: ${movimientoIds.length})`);

  const reversa = await revertirPuenteRecibo({
    reciboRecordId: reciboId, numeroRecibo: "REC-000042", movimientoIds,
    registradoPor: "Test", ambiente: "2",
  });
  assert(reversa.montoRevertido === 20, `La anulación revierte solo la venta adicional ($20, obtenido: $${reversa.montoRevertido})`);

  const egresos = [...state.movimientos.values()].filter((m) => m.fields["Tipo de movimiento"] === "Egreso");
  assert(egresos.length === 2, `Un egreso por cada cobro adicional (obtenido: ${egresos.length})`);
  assert(egresos.every((e) => e.fields["Categoría"] === "Devolución"), "Los egresos de la anulación van a Devolución");
  const egresoDeUna = egresos.find((e) => e.fields["Monto"] === 5);
  assert((egresoDeUna?.fields["Cuenta Origen (Finanzas)"] as string[])?.[0] === deuna, "Cada reversa sale de la MISMA cuenta a la que entró (DeUna)");
  assert(!egresos.some((e) => e.fields["Monto"] === 50 || e.fields["Monto"] === 30), "Los abonos ($50 y $30) NO se devuelven: son pagos de la orden (decisión del dueño)");

  // ─── Cuenta pagada y sin venta adicional: ningún ingreso nuevo ─────────────
  const operacion2Id = crearRegistroDouble(state, "Operación Comercial", {
    "Orden de Reparación": [], "Artículo físico": [], Abonos: [],
  });
  const recibo2Id = crearRegistroDouble(state, "Recibos", { "Número": "REC-000043", Estado: "Vigente", Total: 45 });
  const antes = state.movimientos.size;
  const r2 = await procesarPuenteRecibo({
    reciboRecordId: recibo2Id, numeroRecibo: "REC-000043",
    origen: { tipo: "operacion", recordId: operacion2Id },
    pagosAdicionales: [], registradoPor: "Test", ambiente: "2",
  });
  assert(r2.adicionalRegistrado === 0 && state.movimientos.size === antes, "Sin venta adicional no se crea ningún movimiento");

  // ─── Guard de ambiente: en PRUEBAS no se toca /finanzas ────────────────────
  const antesPruebas = state.movimientos.size;
  const r3 = await procesarPuenteRecibo({
    reciboRecordId: recibo2Id, numeroRecibo: "REC-000044",
    origen: { tipo: "operacion", recordId: operacion2Id },
    pagosAdicionales: [{ metodoPago: "Efectivo", total: 10 }], registradoPor: "Test", ambiente: "1",
  });
  assert(r3.estado === "OMITIDO", "En ambiente PRUEBAS el puente se omite");
  assert(state.movimientos.size === antesPruebas, "En PRUEBAS no se creó ningún movimiento");

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) { console.error(`\n${fallos} fallo(s).`); process.exit(1); }
  console.log("\nOK — el recibo desde una orden no duplica el ingreso de los abonos y la venta adicional entra a su cuenta.");
}

const fetchOriginal = global.fetch;
main();

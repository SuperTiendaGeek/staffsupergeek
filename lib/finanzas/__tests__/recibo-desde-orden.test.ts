/**
 * Test — puente contable del RECIBO emitido desde una orden/operación.
 *
 * La regla que protege: una orden que ya tenía abonos cobrados NO puede
 * volver a registrar ese dinero al cerrarse con recibo. Los abonos ya están
 * en /finanzas (puente de Abonos); el recibo solo los marca como
 * documentados y registra el SALDO. Es exactamente lo que hace la factura
 * (ver 20-2.8), y sin esto cerrar con recibo inflaría los ingresos del día.
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

  crearCuentaDouble(state, { nombre: "Caja Registradora", fechaCorte: "2026-01-01" });

  // Orden con dos abonos vigentes ($50 + $30 = $80), cada uno ya con su
  // movimiento creado por el puente de Abonos.
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

  // Recibo por $100 sobre una cuenta con $80 ya abonados → saldo $20.
  const resultado = await procesarPuenteRecibo({
    reciboRecordId: reciboId, numeroRecibo: "REC-000042",
    origen: { tipo: "operacion", recordId: operacionId },
    total: 100, formaPagoSaldo: "01", registradoPor: "Test", ambiente: "2",
  });

  assert(resultado.estado === "OK", `El puente termina OK (obtenido: ${resultado.estado}${resultado.detalle ? " — " + resultado.detalle : ""})`);
  assert(resultado.abonosMarcados === 2, `Se marcaron los 2 abonos (obtenido: ${resultado.abonosMarcados})`);
  assert(resultado.saldoRegistrado === 20, `Solo se registró el saldo de $20 (obtenido: $${resultado.saldoRegistrado})`);
  assert(state.movimientos.size === 3, `Hay 3 movimientos: 2 actualizados + 1 nuevo por el saldo (obtenido: ${state.movimientos.size})`);

  const m1 = state.movimientos.get(mov1.movimientoId)!;
  const m2 = state.movimientos.get(mov2.movimientoId)!;
  assert((m1.fields["Recibo"] as string[])?.[0] === reciboId && (m2.fields["Recibo"] as string[])?.[0] === reciboId,
    "Los movimientos de los abonos quedan vinculados al recibo");
  assert(m1.fields["Monto"] === 50 && m2.fields["Monto"] === 30, "Los montos de los abonos no se alteraron");

  const movSaldo = [...state.movimientos.values()].find((m) => m.id !== mov1.movimientoId && m.id !== mov2.movimientoId)!;
  assert(movSaldo.fields["Monto"] === 20, `El movimiento nuevo es exactamente el saldo ($20, obtenido: $${movSaldo.fields["Monto"]})`);
  assert(movSaldo.fields["Categoría"] === "Venta Producto", "Operación → categoría Venta Producto");
  assert((movSaldo.fields["Recibo"] as string[])?.[0] === reciboId, "El movimiento del saldo queda vinculado al recibo");

  // ─── Anulación: solo se devuelve el saldo, nunca los abonos ────────────────
  const reciboRecord = state.otras.get("Recibos")!.get(reciboId)!;
  const movimientoIds = (reciboRecord.fields["Movimientos Financieros"] as string[] | undefined) ?? [];
  assert(movimientoIds.length === 3, `El recibo quedó enlazado a los 3 movimientos (obtenido: ${movimientoIds.length})`);

  const reversa = await revertirPuenteRecibo({
    reciboRecordId: reciboId, numeroRecibo: "REC-000042", movimientoIds,
    registradoPor: "Test", ambiente: "2",
  });
  assert(reversa.montoRevertido === 20, `La anulación devuelve solo el saldo ($20, obtenido: $${reversa.montoRevertido})`);

  const egreso = [...state.movimientos.values()].find((m) => m.fields["Tipo de movimiento"] === "Egreso")!;
  assert(!!egreso && egreso.fields["Monto"] === 20, "Se creó un Egreso de $20, no de $100");
  assert(egreso?.fields["Categoría"] === "Devolución", "El Egreso de la anulación va a Devolución");

  // ─── Sin abonos: el saldo es el total completo ─────────────────────────────
  const operacion2Id = crearRegistroDouble(state, "Operación Comercial", {
    "Orden de Reparación": [], "Artículo físico": [], Abonos: [],
  });
  const recibo2Id = crearRegistroDouble(state, "Recibos", { "Número": "REC-000043", Estado: "Vigente", Total: 45 });
  const antes = state.movimientos.size;
  const r2 = await procesarPuenteRecibo({
    reciboRecordId: recibo2Id, numeroRecibo: "REC-000043",
    origen: { tipo: "operacion", recordId: operacion2Id },
    total: 45, formaPagoSaldo: "01", registradoPor: "Test", ambiente: "2",
  });
  assert(r2.saldoRegistrado === 45, `Sin abonos, el saldo es el total ($45, obtenido: $${r2.saldoRegistrado})`);
  assert(state.movimientos.size === antes + 1, "Sin abonos se crea exactamente un movimiento");

  // ─── Guard de ambiente: en PRUEBAS no se toca /finanzas ────────────────────
  const antesPruebas = state.movimientos.size;
  const r3 = await procesarPuenteRecibo({
    reciboRecordId: recibo2Id, numeroRecibo: "REC-000044",
    origen: { tipo: "operacion", recordId: operacion2Id },
    total: 45, formaPagoSaldo: "01", registradoPor: "Test", ambiente: "1",
  });
  assert(r3.estado === "OMITIDO", "En ambiente PRUEBAS el puente se omite");
  assert(state.movimientos.size === antesPruebas, "En PRUEBAS no se creó ningún movimiento");

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) { console.error(`\n${fallos} fallo(s).`); process.exit(1); }
  console.log("\nOK — el recibo desde una orden no duplica el ingreso de los abonos.");
}

const fetchOriginal = global.fetch;
main();

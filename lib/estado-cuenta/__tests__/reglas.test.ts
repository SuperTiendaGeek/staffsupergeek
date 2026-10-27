/**
 * Test — una sola calculadora del estado de cuenta (auditoría ops, punto 4).
 *
 * Casos reales (27-oct-2026):
 *   · OP-2026-000024: pedido suelto, batería Dell $70, en "Pedido" SIN
 *     artículo físico, $70 abonados. La cuenta decía total $0 y "saldo a
 *     favor $70" (le debíamos al cliente); el tablero decía "Pagado".
 *   · Un pedido de 2 unidades cuyo artículo tiene 3 (una para stock): el
 *     cliente paga 2. "Total a Pagar NV" de Airtable (panel de Cobros) sumaba
 *     el precio del artículo una sola vez.
 *   · OR000382 ↔ OP-2026-000050: un abono con los dos enlaces se contaba dos
 *     veces.
 *
 * Ejecutar: npm test estado-cuenta
 */

import {
  calcularEstadoCuenta,
  resolverEstadoPago,
  totalPagosVigentes,
  precioClienteDeItem,
  pedidosAprobadosSinArticulo,
  sumarCargos,
  ETIQUETA_ESTADO_PAGO,
  type OperacionParaCuenta,
  type DatosDeCargos,
} from "../reglas";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const sinCargos: DatosDeCargos = { servicios: 0, productosDigitales: 0, repuestosHistoricos: 0, items: [], aprobadoSinArticulo: [] };
const op = (o: Partial<OperacionParaCuenta>): OperacionParaCuenta => ({
  id: "recOP000000000024", producto: "Batería Dell", estado: "Pedido",
  precioOpcionElegida: 70, tieneOpcionElegida: true, tieneArticulo: false, ...o,
});

// 1. Estado de pago.
assert(resolverEstadoPago(0, 0) === "sin_cargos", "sin cargos ni pagos → Sin cargos");
assert(resolverEstadoPago(0, 100) === "saldo_a_favor", "anticipo sin nada cargado → Saldo a favor (OR000432 antes de cargar)");
assert(resolverEstadoPago(80, 0) === "sin_pago", "cargos y ningún pago → Sin pago");
assert(resolverEstadoPago(80, 30) === "pago_parcial", "pagó una parte → Pago parcial");
assert(resolverEstadoPago(80, 80) === "pagado", "pagó todo → Pagado");
assert(resolverEstadoPago(80, 80.004) === "pagado", "menos de un centavo no es saldo a favor");
assert(resolverEstadoPago(80, 100) === "saldo_a_favor", "pagó de más → Saldo a favor");
assert(ETIQUETA_ESTADO_PAGO.pago_parcial === "Pago parcial", "etiqueta corta en español");

// 2. Pagos: deduplicados por id, sin anulados.
assert(
  totalPagosVigentes([
    { id: "recABONO135", monto: 135, estado: "Registrado" },
    { id: "recABONO135", monto: 135, estado: "Registrado" }, // llegó por la orden Y por la operación
    { id: "recANULADO", monto: 50, estado: "Anulado" },
  ]) === 135,
  "OR000382: el mismo abono por dos caminos cuenta una vez; el anulado no suma",
);

// 3. Artículo: se cobran las unidades que pidió el cliente.
assert(precioClienteDeItem(30, 2) === 60, "2 unidades a $30 → $60 (aunque el artículo tenga 3)");
assert(precioClienteDeItem(30, 0) === 30, "cantidad inválida vale 1 unidad");
assert(precioClienteDeItem(19.99, 3) === 59.97, "redondeo a centavos");

// 4. OP-2026-000024: pedido suelto aprobado y pagado, sin artículo todavía.
{
  const pendientes = pedidosAprobadosSinArticulo([op({})], new Set());
  const cuenta = calcularEstadoCuenta({
    cargos: { ...sinCargos, aprobadoSinArticulo: pendientes },
    abonos: [{ id: "recA70", monto: 70, estado: "Registrado" }],
  });
  assert(pendientes.length === 1 && pendientes[0].monto === 70, "el pedido aprobado sin artículo suma su precio");
  assert(cuenta.totalCuenta === 70 && cuenta.saldo === 0, `OP-2026-000024: total $70, saldo $0 (vino ${cuenta.totalCuenta} / ${cuenta.saldo})`);
  assert(cuenta.estadoPago === "pagado", "OP-2026-000024: Pagado, ya no 'Saldo a favor $70'");
}

// 5. Cuándo NO suma un pedido.
assert(pedidosAprobadosSinArticulo([op({ tieneArticulo: true })], new Set()).length === 0, "con artículo, cuenta el artículo (no el precio de la opción)");
assert(pedidosAprobadosSinArticulo([op({})], new Set(["recOP000000000024"])).length === 0, "si nació de una línea del presupuesto, la cuenta esa línea: no se suma dos veces");
for (const estado of ["Requerimiento", "Cotizado", "Rechazado"]) {
  assert(pedidosAprobadosSinArticulo([op({ estado })], new Set()).length === 0, `en "${estado}" el cliente no ha aprobado precio → no suma`);
}
assert(pedidosAprobadosSinArticulo([op({ tieneOpcionElegida: false, precioOpcionElegida: 0 })], new Set()).length === 0, "sin opción elegida no hay precio");
assert(pedidosAprobadosSinArticulo([op({}), op({})], new Set()).length === 1, "la misma operación repetida suma una vez");
assert(pedidosAprobadosSinArticulo([op({ estado: "Aprobado" })], new Set())[0].motivo === "falta_pedir", "Aprobado → 'falta pedirlo'");
assert(pedidosAprobadosSinArticulo([op({ estado: "Entregado" })], new Set()).length === 1, "OP-2026-000009: entregado sin artículo registrado también cuenta su precio");

// 6. La cuenta completa de una orden.
{
  const c = calcularEstadoCuenta({
    cargos: {
      servicios: 25,
      productosDigitales: 30,
      repuestosHistoricos: 10,
      items: [
        { id: "recITEMPEDIDO", precio: precioClienteDeItem(30, 2) },
        { id: "recITEMSTOCK", precio: 45 },
        { id: "recITEMSTOCK", precio: 45 }, // repetido: una vez
      ],
      aprobadoSinArticulo: [{ id: "recLINEA", nombre: "Tapa", tipo: "Repuesto", monto: 40, motivo: "falta_pedir" }],
    },
    abonos: [{ id: "a1", monto: 100, estado: "Registrado" }],
  });
  assert(c.totalRepuestos === 115, `repuestos: 60 + 45 + 10 históricos = 115 (vino ${c.totalRepuestos})`);
  assert(c.totalCuenta === 210, `total: 115 + 25 + 30 + 40 = 210 (vino ${c.totalCuenta})`);
  assert(c.saldo === 110 && c.porCobrar === 110 && c.aFavor === 0, "saldo $110 por cobrar");
  assert(c.estadoPago === "pago_parcial", "Pago parcial");
}
{
  const c = calcularEstadoCuenta({ cargos: { ...sinCargos, servicios: 25 }, abonos: [{ id: "a", monto: 60, estado: "Registrado" }] });
  assert(c.saldo === -35 && c.aFavor === 35 && c.porCobrar === 0 && c.estadoPago === "saldo_a_favor", "pagó $60 de $25 → $35 a favor");
}
assert(sumarCargos(sinCargos).totalCuenta === 0, "cuenta vacía = $0");

if (fallos > 0) { console.error(`\n${fallos} prueba(s) fallaron.`); process.exit(1); }
console.log("\nTodas las pruebas pasaron.");

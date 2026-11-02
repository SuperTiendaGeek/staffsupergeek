/**
 * Test — comprobante de abono de una orden u operación (2-nov-2026).
 * Ejecutar: npm test comprobante-abono
 */
import fs from "fs";
import {
  armarComprobanteAbono, buscarAbonoParaComprobante, enlacesComprobanteAbono, fechaComprobante,
  numeroDeAbono, referenciaDeCuenta, type AbonoDeCuenta, type CuentaParaComprobante,
} from "../comprobante-abono";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const abono = (o: Partial<AbonoDeCuenta>): AbonoDeCuenta => ({
  id: "recA", idAbono: "303", fecha: "2026-11-02T17:05:00.000Z", monto: 130, metodoPago: "Transferencia",
  estado: "Registrado", observacion: null, numeroTransaccion: "147743511", ...o,
});

// OP-2026-000126: Camila aprueba la tapa de $130 (aún por llegar) y paga todo.
const op126: CuentaParaComprobante = {
  ordenIdVisible: null, operacionCodigo: "OP-2026-000126",
  items: [], servicios: [], productosDigitales: [], repuestosHistoricos: [], repuestosHistoricosCuentanParaTotal: false,
  aprobadoSinArticulo: [{ id: "recOpc", nombre: "Tapa trasera LCD HP Pavilion x360", monto: 130 }],
  descuentos: [], totalCuenta: 130, totalAbonado: 130, saldo: 0, estadoPago: "pagado",
  abonos: [abono({})],
};

{
  const c = armarComprobanteAbono(op126, op126.abonos[0], { nombre: "Camila Gonzalez", identificacion: "", telefono: "", correo: "" });
  assert(c.numero === "ABO-000303", "número legible del abono (ID Abono 303)");
  assert(c.referencia === "OP-2026-000126", "la cuenta es la del pedido");
  assert(c.abono.monto === 130 && c.abono.metodo === "Transferencia" && c.abono.transaccion === "147743511", "monto, forma y transacción del pago");
  assert(c.cargos.length === 1 && c.cargos[0].enEspera && c.cargos[0].neto === 130, "lo aprobado que espera llegar aparece como cargo 'por llegar'");
  assert(c.totalCuenta === 130 && c.totalPagado === 130 && c.saldoPendiente === 0 && c.saldoAFavor === 0, "cuenta saldada");
  assert(c.pagos.length === 1 && c.pagos[0].esEste, "lista de pagos marca este");
}

// Orden con dos pagos, uno anulado y un descuento: OR000522 + OP-129.
{
  const cuenta: CuentaParaComprobante = {
    ordenIdVisible: "OR000522", operacionCodigo: "OP-2026-000129",
    items: [{ id: "recSSD", nombre: "SSD 256GB", precio: 65 }],
    servicios: [{ id: "recSrv", nombre: "Limpieza", costo: 35 }, { id: "recCero", nombre: "Diagnóstico", costo: 0 }],
    productosDigitales: [], repuestosHistoricos: [], repuestosHistoricosCuentanParaTotal: true, aprobadoSinArticulo: [],
    descuentos: [{ cargoId: "recSrv", monto: 5, estado: "Vigente" }],
    totalCuenta: 95, totalAbonado: 60, saldo: 35, estadoPago: "pago_parcial",
    abonos: [
      abono({ id: "rec2", idAbono: "12", fecha: "2026-10-28T15:00:00.000Z", monto: 10, metodoPago: "Efectivo", numeroTransaccion: null }),
      abono({ id: "rec1", idAbono: "11", fecha: "2026-10-26T15:00:00.000Z", monto: 50, metodoPago: "Efectivo", numeroTransaccion: null }),
      abono({ id: "recX", idAbono: "13", monto: 80, estado: "Anulado" }),
    ],
  };
  const c = armarComprobanteAbono(cuenta, cuenta.abonos[0], { nombre: "Curi Teran", identificacion: "1004542740", telefono: "0967118099", correo: "" });
  assert(c.referencia === "OR000522 · OP-2026-000129", "orden + pedido vinculados en la referencia");
  assert(c.cargos.length === 2, "los cargos de $0 no se imprimen");
  const limpieza = c.cargos.find((g) => g.id === "recSrv");
  assert(limpieza?.descuento === 5 && limpieza.neto === 30, "el descuento vigente se muestra en su línea");
  assert(c.pagos.length === 2 && c.pagos[0].numero === "ABO-000011" && c.pagos[1].esEste, "pagos vigentes en orden de fecha; el anulado no aparece");
  assert(c.saldoPendiente === 35, "saldo pendiente de la calculadora única");
}

// Saldo a favor.
{
  const c = armarComprobanteAbono({ ...op126, totalAbonado: 150, saldo: -20 }, op126.abonos[0], { nombre: "X", identificacion: "", telefono: "", correo: "" });
  assert(c.saldoAFavor === 20 && c.saldoPendiente === 0, "si sobra dinero se muestra como saldo a favor");
}

// Qué abonos tienen comprobante.
assert(buscarAbonoParaComprobante(op126.abonos, "recA").ok, "por record id");
assert(buscarAbonoParaComprobante(op126.abonos, "303").ok, "por ID Abono");
assert(!buscarAbonoParaComprobante(op126.abonos, "recOtro").ok, "un abono de otra cuenta no se imprime");
assert(!buscarAbonoParaComprobante([abono({ monto: -20, metodoPago: "Saldo a favor" })], "recA").ok, "un traspaso a saldo a favor (negativo) no es un pago");
{
  const anulado = armarComprobanteAbono(op126, abono({ estado: "Anulado" }), { nombre: "X", identificacion: "", telefono: "", correo: "" });
  assert(anulado.abono.anulado, "un pago anulado se imprime marcado ANULADO");
}

assert(numeroDeAbono({ id: "recABCDEF123456", idAbono: null }) === "ABO-123456", "sin ID Abono: se usa el final del record id");
assert(referenciaDeCuenta({ ordenIdVisible: null, operacionCodigo: null }) === "—", "sin referencia");
assert(fechaComprobante("2026-11-03T03:00:00.000Z") === "02/11/2026", "fecha en hora de Ecuador (UTC-5)");
assert(fechaComprobante(null) === "—", "sin fecha");

{
  const e = enlacesComprobanteAbono("operacion", "rec8AE3GzNNbSpsLW", "recPLDwOuGDmoTiyL");
  assert(e.ticket === "/operaciones/rec8AE3GzNNbSpsLW/abonos/recPLDwOuGDmoTiyL/imprimir", "ticket del pedido");
  assert(e.pdf === "/api/operaciones/rec8AE3GzNNbSpsLW/abonos/recPLDwOuGDmoTiyL/pdf", "PDF del pedido");
  const o = enlacesComprobanteAbono("orden", "recO", "recA");
  assert(o.ticket === "/tecnicos/ordenes/recO/abonos/recA/imprimir" && o.pdf === "/api/tecnicos/ordenes/recO/abonos/recA/pdf", "ticket y PDF de la orden");
}

// Las rutas existen y el ticket usa el estilo de Facturación.
for (const f of [
  "app/operaciones/[id]/abonos/[abonoId]/imprimir/page.tsx",
  "app/tecnicos/ordenes/[id]/abonos/[abonoId]/imprimir/page.tsx",
  "app/api/operaciones/[id]/abonos/[abonoId]/pdf/route.ts",
  "app/api/tecnicos/ordenes/[id]/abonos/[abonoId]/pdf/route.ts",
]) assert(fs.existsSync(f), `existe ${f}`);
const ticket = fs.readFileSync("components/facturacion/print/TicketComprobanteAbono.tsx", "utf8");
assert(ticket.includes("TICKET_CSS") && ticket.includes("EmisorHeader"), "el ticket usa las piezas de los tickets de Facturación");
const panel = fs.readFileSync("components/cuenta-unificada/CuentaUnificadaPanel.tsx", "utf8");
assert(panel.includes("enlacesComprobanteAbono("), "la cuenta (orden y pedido) ofrece Ticket y PDF por cada pago");
assert(fs.readFileSync("app/api/operaciones/[id]/abonos/[abonoId]/pdf/route.ts", "utf8").includes("requireOperacionesSession"), "el PDF del pedido pide sesión de Operaciones");
assert(fs.readFileSync("app/api/tecnicos/ordenes/[id]/abonos/[abonoId]/pdf/route.ts", "utf8").includes("requireTecnicosSession"), "el PDF de la orden pide sesión de Técnicos");

if (fallos > 0) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo OK");

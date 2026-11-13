/**
 * Test — "Pasar a pedido aparte" (punto 10C-1).
 * Ejecutar: npm test pedido-aparte
 */
import {
  errorPedidoAparte,
  montoATraspasar,
  observacionEntrada,
  observacionSalida,
  pagadoNeto,
  repartirTraspaso,
  resumenPedidoAparte,
  totalLinea,
  type AbonoParaTraspaso,
  type LineaParaAparte,
} from "../pedido-aparte";
import { esAbonoDeTraspaso, etiquetaAbono, METODO_TRASPASO } from "../../cobros/metodos";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const cargador: LineaParaAparte = {
  id: "recL", tipo: "Repuesto", descripcion: "Cargador Dell 65 W", cantidad: 1, precioUnitario: 55,
  estado: "Cargada", bajoPedido: true, garantia: "", pedidoId: null,
};
const viva = { estado: "Comprada", situacionClave: "en_camino" };
const ok = (c: Partial<Parameters<typeof errorPedidoAparte>[0]>) =>
  errorPedidoAparte({ estadoOrden: "Completado", tieneDocumento: false, linea: cargador, solicitud: viva, ...c });

// ─── ¿Se puede? ──────────────────────────────────────────────────────────────
assert(ok({}) === null, "repuesto bajo pedido en camino: se puede");
assert(ok({ linea: { ...cargador, estado: "Aprobada" }, solicitud: { estado: "Por comprar", situacionClave: "falta_pedir" } }) === null, "aún sin comprar: también se puede");
assert(ok({ solicitud: { estado: "Comprada", situacionClave: "llego" } }) === null, "ya llegó pero no se entrega: se puede");
assert(ok({ estadoOrden: "Finalizado Entregado" }) === "La orden ya está cerrada.", "orden entregada: no");
assert(ok({ tieneDocumento: true })!.startsWith("La orden ya tiene factura o recibo"), "orden con documento: no (una cuenta = un documento)");
assert(ok({ linea: { ...cargador, pedidoId: "recP" } }) === "Esta línea ya es de un pedido.", "ya es de un pedido: no");
assert(ok({ linea: { ...cargador, tipo: "Servicio" } }) === "Solo un repuesto bajo pedido pasa a pedido aparte.", "un servicio: no");
assert(ok({ linea: { ...cargador, bajoPedido: false } }) === "Solo un repuesto bajo pedido pasa a pedido aparte.", "repuesto de stock: no");
assert(ok({ linea: { ...cargador, garantia: "Confirmada" } }) === "Una línea en garantía se queda en la orden.", "garantía: no");
assert(ok({ linea: { ...cargador, estado: "Propuesta" } }) === "Solo una línea aprobada pasa a pedido aparte.", "propuesta: no");
assert(ok({ solicitud: null }) === "La línea no tiene una compra viva.", "sin solicitud: no");
assert(ok({ solicitud: { estado: "Cancelada", situacionClave: "cancelado" } }) === "La línea no tiene una compra viva.", "solicitud cancelada: no");
assert(ok({ solicitud: { estado: "Comprada", situacionClave: "entregado" } }) === "Ese repuesto ya se entregó.", "ya entregado: no");
assert(totalLinea({ precioUnitario: 12.5, cantidad: 2 }) === 25, "total de la línea = precio × cantidad");

// ─── El dinero (opción A) ────────────────────────────────────────────────────
const ab = (id: string, monto: number, metodo: string, fecha: string, estado = "Registrado", referencia = ""): AbonoParaTraspaso =>
  ({ id, monto, metodo, fecha, estado, referencia });

const juan = [ab("a1", 80, "Transferencia", "2026-11-03", "Registrado", "86139113")];
assert(pagadoNeto(juan) === 80, "pagado: $80");
assert(montoATraspasar(55, juan) === 55, "se va hasta el precio: $55");
assert(montoATraspasar(55, [ab("a1", 30, "Efectivo", "2026-11-01")]) === 30, "si no alcanza, se va lo que hay");
assert(montoATraspasar(55, []) === 0, "sin pagos, no se va nada");
assert(montoATraspasar(55, [ab("a1", 80, "Efectivo", "2026-11-01", "Anulado")]) === 0, "los anulados no cuentan");

const r = repartirTraspaso(juan, 55);
assert(r.length === 1 && r[0].monto === 55 && r[0].metodo === "Transferencia" && r[0].referencia === "86139113",
  "una sola transferencia: el pedido recibe $55 por transferencia con la misma referencia");

const mixto = [ab("e", 30, "Efectivo", "2026-11-01"), ab("t", 50, "Transferencia", "2026-11-03", "Registrado", "999")];
const r2 = repartirTraspaso(mixto, 55);
assert(r2.length === 2 && r2.find((p) => p.metodo === "Transferencia")?.monto === 50 && r2.find((p) => p.metodo === "Efectivo")?.monto === 5,
  "se toma primero de lo más reciente (como la factura): transferencia $50 + efectivo $5");
assert(r2.reduce((s, p) => s + p.monto, 0) === 55, "las partes suman lo que se va");

const conSalida = [ab("e", 30, "Efectivo", "2026-11-01"), ab("t", 50, "Transferencia", "2026-11-03"), ab("s", -20, "Saldo a favor", "2026-11-04")];
const r3 = repartirTraspaso(conSalida, 55);
assert(r3.length === 2 && r3.find((p) => p.metodo === "Transferencia")?.monto === 30 && r3.find((p) => p.metodo === "Efectivo")?.monto === 25,
  "una salida previa ya consumió $20 de la transferencia: quedan $30 + efectivo $25");

const desordenados = [ab("t", 50, "Transferencia", "2026-11-03"), ab("e", 30, "Efectivo", "2026-11-01")];
assert(repartirTraspaso(desordenados, 40).every((p) => p.metodo === "Transferencia"), "el orden es por fecha, no por cómo llegan");

// ─── Lo que ve el empleado ───────────────────────────────────────────────────
const res = resumenPedidoAparte({ precioLinea: 55, totalCuentaOrden: 115, abonos: juan });
assert(res.alPedido === 55 && res.quedaEnOrden === 25 && res.faltaOrden === 35 && res.faltaPedido === 0,
  "Juan: $55 al pedido, $25 quedan, para la laptop se cobran $35, el cargador va pagado");
const corto = resumenPedidoAparte({ precioLinea: 55, totalCuentaOrden: 115, abonos: [ab("a", 30, "Efectivo", "2026-11-01")] });
assert(corto.alPedido === 30 && corto.quedaEnOrden === 0 && corto.faltaOrden === 60 && corto.faltaPedido === 25,
  "pagó $30: todo va al cargador (faltan $25 al retirarlo) y la laptop debe $60");

// ─── Marcas del traspaso ─────────────────────────────────────────────────────
assert(esAbonoDeTraspaso(METODO_TRASPASO, ""), "el abono de salida es de traspaso");
assert(esAbonoDeTraspaso("Transferencia", observacionEntrada("OR000541", "303")), "el abono de entrada (copia del método) también: Finanzas nunca lo asienta");
assert(observacionSalida("OP-2026-000141", " Cargador ").startsWith("Traspaso al pedido OP-2026-000141 (Cargador)"), "la salida dice a qué pedido fue");
assert(!esAbonoDeTraspaso("Transferencia", "Pago del cliente"), "un abono normal no es de traspaso");
assert(etiquetaAbono(METODO_TRASPASO, -55) === "Pasado a pedido aparte", "así se lee en la cuenta de la orden");

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo OK");

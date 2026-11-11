/**
 * Test — reglas del pedido especial (punto 10A).
 * Ejecutar: npm test pedidos-especiales
 */
import {
  anticipoRequerido,
  errorAceptar,
  estadoComercial,
  horasDeVigencia,
  mensajeCotizacion,
  pedidoAceptado,
  planCancelacion,
  resumenAnticipo,
  textoAnticipo,
  textoFechaHora,
  textoVigencia,
  totalElegido,
  unidadesDelCliente,
  venceCotizacion,
  vigencia,
  type LineaParaAceptar,
} from "../reglas";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

// 1. Anticipo por tramos (decisión 1)
assert(anticipoRequerido(30) === 30, "hasta $100 se paga completo ($30 → $30)");
assert(anticipoRequerido(100) === 100, "$100 justos → pago completo");
assert(anticipoRequerido(100.01) === 50.01, "más de $100 → 50 % ($100,01 → $50,01)");
assert(anticipoRequerido(450) === 225, "laptop de $450 → anticipo $225");
assert(anticipoRequerido(0) === 0 && anticipoRequerido(-5) === 0 && anticipoRequerido(NaN) === 0, "sin total no hay anticipo");
assert(textoAnticipo(450) === "Hoy $225 · Al retirar $225", "texto para el cliente sobre $100");
assert(textoAnticipo(80) === "Pago completo: $80", "texto para el cliente hasta $100");
assert(textoAnticipo(155) === "Hoy $77.50 · Al retirar $77.50", "con centavos");

const r1 = resumenAnticipo(450, 100);
assert(r1.faltaAnticipo === 125 && r1.faltaTotal === 350 && !r1.cubierto && r1.hoy === 125 && r1.alRetirar === 225,
  "pagó $100 de un anticipo de $225: faltan $125 hoy y $225 al retirar");
const r2 = resumenAnticipo(450, 225);
assert(r2.cubierto && r2.faltaAnticipo === 0 && r2.faltaTotal === 225, "anticipo cubierto, falta la mitad al retirar");
const r3 = resumenAnticipo(30, 30);
assert(r3.cubierto && r3.faltaTotal === 0 && r3.alRetirar === 0, "$30 pagado completo: no falta nada");

// 2. Vigencia (decisión 2)
const envio = new Date("2026-11-10T23:00:00.000Z"); // martes 10-nov, 18:00 Ecuador
assert(horasDeVigencia() === 72, "72 h por defecto");
assert(horasDeVigencia(1) === 24 && horasDeVigencia(7) === 168, "1 a 7 días");
let fuera = 0;
for (const d of [0, 8, 1.5]) { try { horasDeVigencia(d); } catch { fuera++; } }
assert(fuera === 3, "fuera de 1–7 días (o con decimales) es un error");
const vence = venceCotizacion(envio);
assert(vence === "2026-11-13T23:00:00.000Z", "enviada el martes 18:00 → vence el viernes 18:00");
assert(textoFechaHora(vence) === "viernes 13-nov, 18:00", "fecha y hora exactas, en hora de Ecuador");
assert(textoVigencia(vence, envio) === "Precio válido hasta el viernes 13-nov, 18:00", "texto de vigencia para el cliente");
assert(vigencia(vence, envio) === "vigente", "recién enviada: vigente");
assert(vigencia(vence, new Date("2026-11-13T00:00:00.000Z")) === "por_vencer", "a menos de 24 h: por vencer (aviso interno)");
assert(vigencia(vence, new Date("2026-11-13T23:00:00.000Z")) === "vencida", "a la hora exacta: vencida");
assert(vigencia("", envio) === "sin_fecha" && vigencia(null, envio) === "sin_fecha", "sin fecha");
assert(textoVigencia(vence, new Date("2026-11-14T00:00:00.000Z")).startsWith("Esta cotización venció"), "vencida: texto amable");

// 3. Estado comercial y estados viejos
assert(estadoComercial("Requerimiento") === "Cotizando" && estadoComercial("Cotizado") === "Esperando al cliente", "viejo: Requerimiento/Cotizado");
assert(estadoComercial("Aprobado") === "Aceptado" && estadoComercial("Pedido") === "Aceptado", "viejo: Aprobado/Pedido → Aceptado");
assert(estadoComercial("Rechazado") === "Cancelado" && estadoComercial("Entregado") === "Entregado", "viejo: Rechazado/Entregado");
assert(estadoComercial("Esperando al cliente") === "Esperando al cliente" && estadoComercial("") === "Cotizando", "nuevos y vacío");
assert(pedidoAceptado("Aceptado") && pedidoAceptado("Entregado") && !pedidoAceptado("Esperando al cliente"), "solo lo aceptado suma");

// 4. Aceptar
const L = (p: Partial<LineaParaAceptar> & { id: string }): LineaParaAceptar => ({ descripcion: p.id, estado: "Propuesta", precioUnitario: 100, cantidad: 1, ...p });
const lineas = [
  L({ id: "dell", descripcion: "Dell i5", precioUnitario: 430, grupoAlternativas: "g1" }),
  L({ id: "lenovo", descripcion: "Lenovo i7", precioUnitario: 480, grupoAlternativas: "g1" }),
  L({ id: "mouse", descripcion: "Mouse", precioUnitario: 15, cantidad: 2 }),
  L({ id: "sinprecio", descripcion: "Funda", precioUnitario: 0 }),
];
const base = { estado: "Esperando al cliente", vence, lineas, ahora: envio };
assert(errorAceptar({ ...base, elegidas: ["lenovo", "mouse"] }) === null, "Lenovo + mouse: se puede aceptar");
assert(totalElegido(lineas, ["lenovo", "mouse"]) === 510, "total elegido = $480 + 2 × $15");
assert(errorAceptar({ ...base, elegidas: ["dell", "lenovo"] }) === "Solo se puede elegir una de las alternativas.", "dos alternativas del mismo grupo: no");
assert(errorAceptar({ ...base, elegidas: [] }) === "Elige al menos una opción.", "sin elegir nada: no");
assert((errorAceptar({ ...base, elegidas: ["sinprecio"] }) ?? "").includes("no tiene precio"), "sin precio: no");
assert((errorAceptar({ ...base, elegidas: ["lenovo"], ahora: new Date("2026-11-14T00:00:00.000Z") }) ?? "").includes("venció"), "vencida: hay que renovar");
assert(errorAceptar({ ...base, estado: "Aceptado", elegidas: ["lenovo"] }) === "El pedido ya fue aceptado.", "ya aceptado: no dos veces");
assert(errorAceptar({ ...base, estado: "Cancelado", elegidas: ["lenovo"] }) === "El pedido está cancelado.", "cancelado: no");
assert(errorAceptar({ ...base, estado: "Cotizando", vence: null, elegidas: ["lenovo"] }) === null, "en tienda sin enlace enviado (sin fecha): se puede");

// 5. Cancelar (decisión 8)
const antes = planCancelacion({ pagado: 225, pedidoAlProveedor: false });
assert(antes.opciones.join() === "devolver,saldo_a_favor" && !antes.piezaQuedaEnTienda, "antes de pedir: devolver o saldo a favor");
const despues = planCancelacion({ pagado: 225, pedidoAlProveedor: true });
assert(despues.opciones.join() === "saldo_a_favor" && despues.piezaQuedaEnTienda, "después de pedir: solo saldo a favor y la pieza queda en tienda");
assert(planCancelacion({ pagado: 0, pedidoAlProveedor: false }).opciones.length === 0, "sin pagos: se cancela sin más");

// 6. Unidades que se cobran
assert(unidadesDelCliente(2, 5) === 2, "manda la cantidad de la línea del pedido");
assert(unidadesDelCliente(null, 3) === 3, "si no hay línea, la de la opción vieja");
assert(unidadesDelCliente(null, null) === 1 && unidadesDelCliente(0, 1.5) === 1, "si no, 1");

// 7. Mensaje de la cotización
const msg = mensajeCotizacion({
  cliente: "Javier Ulcuango", codigo: "OP-2026-000130", vence, ahora: envio,
  lineas: [
    { descripcion: "Dell i5 11va", cantidad: 1, precioUnitario: 430, esAlternativa: true },
    { descripcion: "Lenovo i7 11va", cantidad: 1, precioUnitario: 480, esAlternativa: true, notaCliente: "8GB GPU" },
    { descripcion: "Mouse", cantidad: 2, precioUnitario: 15, esAlternativa: false },
  ],
});
assert(msg.startsWith("Hola Javier, esta es la cotización de tu pedido OP-2026-000130:"), "saluda por el primer nombre");
assert(msg.includes("1. Dell i5 11va: $430") && msg.includes("2. Lenovo i7 11va: $480 (8GB GPU)"), "alternativas numeradas con su nota");
assert(msg.includes("Además:\n• Mouse ×2: $30"), "adicionales con su total");
assert(msg.includes("Precio válido hasta el viernes 13-nov, 18:00"), "lleva la vigencia exacta");
assert(!/proveedor sugerido|costo|http/i.test(msg.replace("los precios del proveedor cambian rápido", "")), "sin datos internos");

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo OK");

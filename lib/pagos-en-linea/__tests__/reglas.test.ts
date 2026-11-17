/**
 * Test — reglas de pagos en línea (punto 23 / 10D, 17-nov-2026).
 * Ejecutar: npm test pagos-en-linea
 */
import {
  codigoPago, decidirAplicacion, leerDecision, pagoParaMostrar, textoDecision, desgloseIva, estadoVisible, evaluarConfirmacion, huellaEleccion, medioPayPhone,
  montoACobrar, opcionesDePago, resumenPago, tarifaYNeto, tarjetaVisible, type CuentaParaCobro,
} from "../reglas";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

// ── Tarifa y neto: las ventas reales del dueño ──────────────────────────────
const v990 = tarifaYNeto(990, "PayPhone", "Tarjeta de crédito");
assert(v990.tarifa === 56.93 && v990.neto === 933.07, "venta real $990 crédito: tarifa $56,93, neto $933,07");
const v590 = tarifaYNeto(590, "PayPhone", "Tarjeta de débito");
assert(v590.tarifa === 33.93 && v590.neto === 556.07, "venta real $590 débito: tarifa $33,93, neto $556,07");
const v205 = tarifaYNeto(205, "PayPhone", "Tarjeta de crédito");
assert(v205.tarifa === 11.79 && v205.neto === 193.21, "Camila $205: tarifa $11,79, neto $193,21");
const saldo = tarifaYNeto(205, "PayPhone", "Saldo PayPhone");
assert(saldo.tarifa === 0 && saldo.neto === 205, "saldo PayPhone: sin comisión");
const c = tarifaYNeto(33.33, "PayPhone", "Tarjeta de crédito");
assert(c.tarifa === 1.92 && c.neto === 31.41, "centavos: $33,33 → tarifa $1,92");

// ── Desglose IVA (precio incluye 15 %) ──────────────────────────────────────
const d = desgloseIva(205);
assert(d.totalC === 20500 && d.baseC === 17826 && d.ivaC === 2674, "$205 → base $178,26 + IVA $26,74");
const d2 = desgloseIva(0.1);
assert(d2.baseC + d2.ivaC === d2.totalC, "la suma del desglose siempre es exacta");
for (const m of [1, 9.99, 33.33, 100, 410, 1234.56]) {
  const x = desgloseIva(m);
  assert(x.baseC + x.ivaC === x.totalC && x.ivaC >= 0, `desglose exacto para $${m}`);
}

// ── ¿Cuánto puede pagar? ─────────────────────────────────────────────────────
const porPagar: CuentaParaCobro = { fase: "por_pagar", pago: { total: 410, pagado: 0, paraConfirmar: 205, faltaParaConfirmar: 205, faltaTotal: 410 } };
const ops = opcionesDePago(porPagar);
assert(ops.length === 2 && ops[0].para === "Confirmar" && ops[0].monto === 205 && ops[1].para === "Todo" && ops[1].monto === 410, "Camila $410: anticipo $205 o todo $410");
const chico: CuentaParaCobro = { fase: "por_pagar", pago: { total: 80, pagado: 0, paraConfirmar: 80, faltaParaConfirmar: 80, faltaTotal: 80 } };
assert(opcionesDePago(chico).length === 1, "hasta $100: solo una opción (todo)");
const conAbono: CuentaParaCobro = { fase: "por_pagar", pago: { total: 440, pagado: 50, paraConfirmar: 220, faltaParaConfirmar: 170, faltaTotal: 390 } };
const m1 = montoACobrar(conAbono, "Confirmar");
assert(m1.ok && m1.monto === 170, "guía PayPhone: $440, anticipo $220, abonó $50 → cobrar $170");
const confirmado: CuentaParaCobro = { fase: "confirmado", pago: { total: 410, pagado: 205, paraConfirmar: 205, faltaParaConfirmar: 0, faltaTotal: 205 } };
const m2 = montoACobrar(confirmado, "Lo que falta");
assert(m2.ok && m2.monto === 205, "en la tienda: lo que falta $205");
assert(!montoACobrar(confirmado, "Confirmar").ok, "confirmado: ya no se cobra anticipo");
assert(!montoACobrar({ ...confirmado, pago: { ...confirmado.pago, faltaTotal: 0 } }, "Lo que falta").ok, "pagado completo: nada que cobrar");
assert(!montoACobrar({ ...porPagar, fase: "cotizacion" }, "Confirmar").ok, "sin elegir: no se cobra");
assert(!montoACobrar({ ...porPagar, fase: "cancelado" }, "Todo").ok, "cancelado: no se cobra");

// ── Confirmación de PayPhone ────────────────────────────────────────────────
const intento = { codigo: "PL-000001", monto: 205 };
const ok = { statusCode: 3, transactionStatus: "Approved", transactionId: 10293847, clientTransactionId: "PL-000001", amount: 20500, currency: "USD", authorizationCode: "A10293847", cardType: "Credit", cardBrand: "Visa", lastDigits: "XX4242" };
const e1 = evaluarConfirmacion(intento, ok);
assert(e1.tipo === "aprobado" && e1.idTransaccion === "10293847" && e1.medio === "Tarjeta de crédito" && e1.tarjeta === "Visa ···· 4242", "aprobado y verificado");
assert(evaluarConfirmacion(intento, { ...ok, amount: 100 }).tipo === "sospechoso", "monto adulterado ($1): sospechoso, sin abono");
assert(evaluarConfirmacion(intento, { ...ok, clientTransactionId: "PL-000002" }).tipo === "sospechoso", "código ajeno: sospechoso");
assert(evaluarConfirmacion(intento, { ...ok, currency: "EUR" }).tipo === "sospechoso", "otra moneda: sospechoso");
assert(evaluarConfirmacion(intento, { ...ok, statusCode: 2, transactionStatus: "Canceled" }).tipo === "rechazado", "cancelado: rechazado");
assert(evaluarConfirmacion(intento, { message: "Error" }).tipo === "desconocido", "respuesta inválida: desconocido");
assert(evaluarConfirmacion(intento, { ...ok, statusCode: 3, transactionStatus: "Pending" }).tipo === "desconocido", "sin 'Approved': no se da por pagado");

// ── Medio ───────────────────────────────────────────────────────────────────
assert(medioPayPhone({ cardType: "Debit", cardBrand: "Mastercard" }) === "Tarjeta de débito", "débito");
assert(medioPayPhone({}) === "Saldo PayPhone", "sin datos de tarjeta: saldo PayPhone");
assert(medioPayPhone({ cardBrand: "Visa" }) === "Tarjeta de crédito", "tarjeta sin tipo: se asume crédito (con comisión)");
assert(tarjetaVisible({}) === "", "saldo: sin texto de tarjeta");

// ── ¿Se aplica? ─────────────────────────────────────────────────────────────
const huella = huellaEleccion({ fecha: "2026-11-17T15:00:00.000Z", elegidas: ["recB", "recA"] });
assert(huella === "2026-11-17T15:00:00.000Z|recA,recB", "huella de la elección (ordenada)");
assert(huellaEleccion(null) === "", "sin elección: huella vacía");
const base = { para: "Confirmar" as const, monto: 205, cuenta: porPagar, eleccionAlPagar: huella, eleccionAhora: huella };
const a1 = decidirAplicacion(base);
assert(a1.estado === "Aplicado" && a1.confirmar, "misma elección: se aplica y confirma el pedido");
assert(decidirAplicacion({ ...base, eleccionAhora: "otra" }).estado === "En revisión", "cambió la elección mientras pagaba: revisión");
assert(decidirAplicacion({ ...base, eleccionAhora: "" }).estado === "En revisión", "la elección dejó de valer: revisión");
assert(decidirAplicacion({ ...base, cuenta: { ...porPagar, fase: "cancelado" } }).estado === "En revisión", "pedido cancelado: revisión");
const a2 = decidirAplicacion({ ...base, cuenta: { fase: "confirmado", pago: { ...porPagar.pago, pagado: 205, faltaTotal: 205 } } });
assert(a2.estado === "Aplicado" && !a2.confirmar, "la tienda confirmó mientras pagaba: suma a la cuenta");
const a3 = decidirAplicacion({ ...base, monto: 410, cuenta: { fase: "confirmado", pago: { ...porPagar.pago, pagado: 205, faltaTotal: 205 } } });
assert(a3.estado === "En revisión" && a3.motivo.includes("$205.00 de más"), "pagó de más (otra transferencia a la vez): revisión");
const a4 = decidirAplicacion({ para: "Lo que falta", monto: 205, cuenta: confirmado, eleccionAlPagar: "", eleccionAhora: "" });
assert(a4.estado === "Aplicado" && !a4.confirmar, "lo que falta: se aplica sin confirmar");

// ── Lo que ve el cliente ────────────────────────────────────────────────────
const ahora = new Date("2026-11-17T15:20:00.000Z");
assert(estadoVisible({ estado: "Abierto", idTransaccion: "", creado: "2026-11-17T15:15:00.000Z" }, ahora) === "abierto", "cajita abierta hace 5 min");
assert(estadoVisible({ estado: "Abierto", idTransaccion: "", creado: "2026-11-17T15:05:00.000Z" }, ahora) === "vencido", "más de 10 min sin pagar: vencido");
assert(estadoVisible({ estado: "Abierto", idTransaccion: "123", creado: "2026-11-17T15:05:00.000Z" }, ahora) === "sin_respuesta", "volvió de PayPhone sin confirmar: no pagues otra vez");
assert(estadoVisible({ estado: "Aplicado", idTransaccion: "123", creado: "" }, ahora) === "recibido", "aplicado: pago recibido");

// ── Decisión guardada (para reintentar igual) ───────────────────────────────
for (const dd of [{ estado: "Aplicado" as const, confirmar: true }, { estado: "Aplicado" as const, confirmar: false }, { estado: "En revisión" as const, motivo: "La opción elegida cambió mientras el cliente pagaba." }]) {
  const vuelta = leerDecision(textoDecision(dd) + " No se pudo crear el movimiento en Finanzas: revísalo.");
  assert(JSON.stringify(vuelta) === JSON.stringify(dd) || (dd.estado === "En revisión" && vuelta?.estado === "En revisión"), `decisión ida y vuelta: ${textoDecision(dd)}`);
}
assert(leerDecision("") === null && leerDecision("Sin respuesta de PayPhone") === null, "sin decisión guardada: null");

// ── Qué intento se muestra ──────────────────────────────────────────────────
const fila = (codigo: string, estado: "Abierto" | "Aplicado" | "Rechazado" | "Vencido", idTransaccion = "", creado = "2026-11-17T15:18:00.000Z") =>
  ({ codigo, estado, idTransaccion, creado, monto: 205, tarjeta: "Visa ···· 4242", confirmadoEn: "", autorizacion: "A1" });
assert(pagoParaMostrar([fila("PL-000001", "Aplicado", "9"), fila("PL-000002", "Abierto")], ahora)?.codigo === "PL-000001", "una cajita abierta después no tapa el pago recibido");
assert(pagoParaMostrar([fila("PL-000001", "Rechazado", "9"), fila("PL-000002", "Abierto", "10")], ahora)?.estado === "sin_respuesta", "el último que volvió de PayPhone manda");
assert(pagoParaMostrar([fila("PL-000001", "Vencido")], ahora) === null, "solo cajitas vencidas: nada que mostrar");

// ── Textos ──────────────────────────────────────────────────────────────────
assert(codigoPago(1) === "PL-000001" && codigoPago(1234567) === "PL-1234567", "código PL");
assert(resumenPago({ codigo: "PL-000001", cuenta: "OP-142", monto: 205, pasarela: "PayPhone", ambiente: "Prueba" }) === "PL-000001 · OP-142 · $205.00 · PayPhone · PRUEBA", "resumen de la tabla");

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo bien.");

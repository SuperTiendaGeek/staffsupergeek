/**
 * Test — reglas de DeUna (etapa D, 18-nov-2026). Sin red.
 * Ejecutar: npm test pagos-en-linea
 */
import {
  CABECERA_AVISO_DEUNA, MINUTOS_VIGENCIA_DEUNA, cuerpoSolicitud, evaluarInfo, identificacionCorta, leerAviso, leerInfo,
  leerRespuestaSolicitud, nombrePropio, problemasDeUna, verificarCabecera,
} from "../deuna-reglas";
import { estadoVisible, parteValida, tarifaYNeto } from "../reglas";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}
function lanza(fn: () => unknown): boolean { try { fn(); return false; } catch { return true; } }

// ─── 1. Pedir el cobro ───
const cuerpo = cuerpoSolicitud({ pointOfSale: "399118", monto: 105, codigo: "PL-000027", detalle: "Orden OR000551 · HP 15 cambio de pantalla y teclado completo" });
assert(cuerpo.qrType === "dynamic" && cuerpo.format === "2" && cuerpo.expiredTime === MINUTOS_VIGENCIA_DEUNA, "cobro dinámico (un uso), QR + enlace, vence a los 15 min");
assert(cuerpo.amount === 105 && cuerpo.internalTransactionReference === "PL-000027" && cuerpo.pointOfSale === "399118", "monto, referencia PL y caja");
assert(cuerpo.detail.length <= 50, "detalle ≤ 50 caracteres (límite de DeUna)");
assert(lanza(() => cuerpoSolicitud({ pointOfSale: "1", monto: 0, codigo: "PL-1", detalle: "" })), "monto 0: no se pide");
assert(lanza(() => cuerpoSolicitud({ pointOfSale: "1", monto: 5, codigo: "PL-0000000000000000001", detalle: "" })), "referencia de 20+ caracteres: no se pide");

const okSolicitud = { transactionId: "59a7fa4a-a6a1-49dc-bc8e-bfd361c58fb4", status: "1", deeplink: "https://pagar.deuna.app/H92p/merchant?id=R8F", qr: "data:image/svg+xml;base64,PHN2Zz4=" };
assert(leerRespuestaSolicitud(okSolicitud)?.transactionId === okSolicitud.transactionId, "respuesta válida → ID, enlace y QR");
assert(leerRespuestaSolicitud({ ...okSolicitud, status: "0" }) === null, "status ≠ 1 → no hay cobro");
assert(leerRespuestaSolicitud({ ...okSolicitud, deeplink: "javascript:alert(1)" }) === null, "enlace que no es https → se descarta");
assert(leerRespuestaSolicitud({ ...okSolicitud, qr: "data:text/html;base64,xx" }) === null, "QR que no es imagen → se descarta");

// ─── 2. ¿Cómo quedó? ───
const intento = { codigo: "PL-000027", monto: 105, idTransaccion: "a31c1924-eab3-4251-b628-d3594ad9d74a" };
const aprobado = leerInfo({
  status: "APPROVED", internalTransactionReference: "PL-000027", amount: 105, transactionId: intento.idTransaccion,
  transferNumber: "044451603432", date: "11/18/2026, 2:35:53 PM", branchId: "399117", posId: "399118", currency: "USD",
  description: "", ordererName: "ANA MARIA PAREDES", ordererIdentification: "1712345678",
});
const ev = evaluarInfo(intento, aprobado, ["399118"]);
assert(ev.tipo === "aprobado" && ev.transferencia === "044451603432" && ev.pagador === "Ana Maria Paredes", "APPROVED + mismo monto, caja y referencia → aprobado (con transferencia y pagador)");
assert(evaluarInfo(intento, { ...aprobado, amount: 1 }, ["399118"]).tipo === "sospechoso", "pagó $1 por un cobro de $105 → sospechoso, sin abono");
assert(evaluarInfo(intento, { ...aprobado, posId: "11820" }, ["399118"]).tipo === "sospechoso", "otra caja → sospechoso");
assert(evaluarInfo(intento, { ...aprobado, currency: "EUR" }, ["399118"]).tipo === "sospechoso", "otra moneda → sospechoso");
assert(evaluarInfo(intento, { ...aprobado, internalTransactionReference: "PL-000028" }, ["399118"]).tipo === "sospechoso", "otra referencia → sospechoso");
assert(evaluarInfo(intento, { ...aprobado, transactionId: "otro" }, ["399118"]).tipo === "sospechoso", "otro ID de transacción → sospechoso");
assert(evaluarInfo(intento, { ...aprobado, amount: 105.0000001 }, ["399118"]).tipo === "aprobado", "decimales de coma flotante no rompen la comparación");
assert(evaluarInfo(intento, leerInfo({ status: "PENDING", amount: 0 }), ["399118"]).tipo === "pendiente", "PENDING → sigue esperando");
assert(evaluarInfo(intento, leerInfo({ status: "NOT_FOUND" }), ["399118"]).tipo === "no_encontrado", "NOT_FOUND → no encontrado");
assert(evaluarInfo(intento, { ...aprobado, status: "REVERSED" }, ["399118"]).tipo === "devuelto", "REVERSED → no se registra abono");
assert(evaluarInfo(intento, { ...aprobado, status: "RARO" }, ["399118"]).tipo === "sospechoso", "estado desconocido → sospechoso");
assert(leerInfo({ amount: "12.5" }).amount === 12.5 && leerInfo({}).amount === null, "monto como texto o ausente");
assert(problemasDeUna({ ...aprobado, transferNumber: "" }, ["399118"]).length === 1, "sin N.º de transferencia → problema");
assert(problemasDeUna(aprobado, []).length === 1, "sin cajas configuradas → revisión (nunca se da por buena)");

// ─── Revisión de Codex (D2): vacío no es "bueno" ───
assert(evaluarInfo(intento, { ...aprobado, currency: "" }, ["399118"]).tipo === "sospechoso", "moneda VACÍA → revisión");
assert(evaluarInfo(intento, { ...aprobado, posId: "" }, ["399118"]).tipo === "sospechoso", "caja VACÍA → revisión");
assert(evaluarInfo(intento, { ...aprobado, internalTransactionReference: "" }, ["399118"]).tipo === "sospechoso", "referencia VACÍA en un cobro de Staff → revisión");
assert(evaluarInfo(intento, { ...aprobado, transactionId: "" }, ["399118"]).tipo === "sospechoso", "ID de transacción VACÍO → revisión");
assert(evaluarInfo({ ...intento, idTransaccion: "" }, aprobado, ["399118"]).tipo === "sospechoso", "intento sin ID guardado → revisión");
assert(evaluarInfo(intento, { ...aprobado, status: "REVERSED_FAILED" }, ["399118"]).tipo === "sospechoso", "REVERSED_FAILED (devolución fallida) → revisión, no 'devuelto'");
// QA: dos cajas (enlaces 4538981, mostrador 4538982).
const qa = { ...aprobado, posId: "4538982" };
assert(evaluarInfo(intento, qa, ["4538981", "4538982"]).tipo === "aprobado", "QA: la caja del mostrador también es nuestra");
assert(evaluarInfo(intento, qa, ["399118"]).tipo === "sospechoso", "una caja de QA nunca vale en producción");

// ─── Comisión y estados ───
const t = tarifaYNeto(105, "DeUna", "DeUna");
assert(t.tarifa === 2.42 && t.neto === 102.58, "DeUna 2 % + IVA = 2,30 %: $105 → comisión $2,42, neto $102,58");
assert(tarifaYNeto(310, "DeUna", "DeUna").tarifa === 7.13, "$310 → comisión $7,13 (maqueta 12)");
const hace = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
assert(estadoVisible({ estado: "Abierto", idTransaccion: "x", creado: hace(5), pasarela: "DeUna" }) === "abierto", "DeUna abierto con ID: esperando el pago (no 'sin respuesta')");
assert(estadoVisible({ estado: "Abierto", idTransaccion: "x", creado: hace(16), pasarela: "DeUna" }) === "vencido", "DeUna a los 16 min: vencido");
assert(estadoVisible({ estado: "Abierto", idTransaccion: "123", creado: hace(5), pasarela: "PayPhone" }) === "sin_respuesta", "PayPhone con ID sigue igual: sin respuesta");

// ─── Dividir el pago (7a) ───
const pv = parteValida(50, 105);
assert(pv.ok && pv.monto === 50, "dividir $105: $50 con tarjeta es válido (el resto, $55, con DeUna)");
assert(!parteValida(0.5, 105).ok && !parteValida(104.5, 105).ok && !parteValida(NaN, 105).ok, "dividir: menos de $1 o dejar menos de $1 para DeUna → no");
assert(parteValida(104, 105).ok, "dividir: hasta el total menos $1");

// ─── 3. El aviso ───
assert(leerAviso({ status: "SUCCESS", idTransaction: "4k86f87c-8918-4x29-85d8-ebe33610ebx3", internalTransactionReference: "PL-000027", amount: 999 })?.referencia === "PL-000027", "aviso SUCCESS → solo ID y referencia (el monto no se usa)");
assert(leerAviso({ status: "FAILED", idTransaction: "4k86f87c-8918" }) === null, "aviso no exitoso → se ignora");
assert(leerAviso({ status: "SUCCESS", idTransaction: "'; DROP" }) === null, "ID con caracteres raros → se ignora");
assert(leerAviso(null) === null && leerAviso("x") === null, "cuerpo vacío o raro → se ignora");

const clave = "k".repeat(40);
assert(CABECERA_AVISO_DEUNA === "x-supergeek-deuna", "nombre de la cabecera");
assert(verificarCabecera("", clave) === "sin_configurar", "sin clave en el portal → se rechaza todo (Codex)");
assert(verificarCabecera("corta", "corta") === "sin_configurar", "clave corta → se trata como no configurada");
assert(verificarCabecera(clave, null) === "rechazado", "aviso sin cabecera → rechazado");
assert(verificarCabecera(clave, "k".repeat(39)) === "rechazado", "clave distinta → rechazado");
assert(verificarCabecera(clave, ` ${clave} `) === "ok", "clave correcta → ok");

// ─── Vista ───
assert(nombrePropio("JUAN CARLOS  ZAMBRANO LOPEZ") === "Juan Carlos Zambrano Lopez", "nombre en formato propio");
assert(nombrePropio("MARÍA JOSÉ ÑUÑEZ") === "María José Ñuñez", "con tildes y eñe");
assert(identificacionCorta("1712344521") === "···4521", "cédula corta");

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo bien.");

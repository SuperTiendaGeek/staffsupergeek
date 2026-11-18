/**
 * Test — bandeja "Pagos recibidos" (maquetas 12 y 12b, 18-nov-2026). Sin red.
 * Ejecutar: npm test pagos-en-linea
 */
import {
  cierre, csvHistorial, cuentaDelResumen, diaEcuador, diasDelPeriodo, etiquetaEstado, fechaHoraEcuador, mejorSugerencia,
  puedeVerBandeja, rangoDias, resumenDelDia, sugerir, urlCuenta, type Candidato, type FilaPago,
} from "../bandeja";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

// ─── Fechas de Ecuador ───
assert(diaEcuador("2026-11-19T03:30:00.000Z") === "2026-11-18", "22:30 del 18 en Ecuador sigue siendo el 18");
assert(diaEcuador("2026-11-18T05:00:00.000Z") === "2026-11-18", "medianoche de Ecuador ya es el 18");
assert(diaEcuador("2026-11-16T00:00:00.000Z") === "2026-11-16", "fecha sin hora (abono) se respeta");
assert(fechaHoraEcuador("2026-11-18T19:32:00.000Z") === "2026-11-18 14:32", "hora de Ecuador para la lista");
const r = rangoDias("2026-11-18", "2026-11-18");
assert(r.desde === "2026-11-18T05:00:00.000Z" && r.hasta === "2026-11-19T05:00:00.000Z", "rango de un día de Ecuador en UTC");
assert(diasDelPeriodo("7dias", "2026-11-18").desde === "2026-11-12", "7 días: del 12 al 18");
assert(diasDelPeriodo("mes", "2026-11-18").desde === "2026-11-01", "este mes: desde el 1");

// ─── Filas y tarjetas (ejemplo de la maqueta 12) ───
const base: FilaPago = {
  codigo: "PL-000001", pasarela: "DeUna", estado: "Aplicado", cuenta: "OR000551", origen: "Orden", monto: 0, tarifa: 0, neto: 0,
  pagador: "", cedula: "", referencia: "", creado: "2026-11-18T15:00:00.000Z", pagadoEn: "2026-11-18T15:01:00.000Z",
  detalle: "", asignadoPor: "", asignadoEn: "", finanzas: "Por acreditar", ambiente: "Producción", destino: null, conAbono: true,
};
const f = (o: Partial<FilaPago>): FilaPago => ({ ...base, ...o });
const filas = [
  f({ codigo: "PL-1", monto: 105, tarifa: 2.42 }), f({ codigo: "PL-2", monto: 35, tarifa: 0.81, estado: "Por asignar" }),
  f({ codigo: "PL-3", monto: 20, tarifa: 0.46, estado: "Por asignar" }), f({ codigo: "PL-4", monto: 150, tarifa: 3.44 }),
  f({ codigo: "PL-5", pasarela: "PayPhone", monto: 95, tarifa: 5.46 }), f({ codigo: "PL-6", pasarela: "PayPhone", monto: 40, tarifa: 2.3, estado: "En revisión" }),
  f({ codigo: "PL-7", pasarela: "PayPhone", monto: 40, tarifa: 2.3 }),
  f({ codigo: "PL-8", monto: 60, tarifa: null, estado: "Vencido", pagadoEn: "" }),
  f({ codigo: "PL-9", monto: 999, tarifa: 0, ambiente: "Prueba" }),
  f({ codigo: "PL-10", monto: 50, tarifa: 1.15, pagadoEn: "2026-11-17T20:00:00.000Z" }),
];
const pend = filas.filter((x) => x.estado === "Por asignar" || x.estado === "En revisión");
const res = resumenDelDia(filas, "2026-11-18", pend);
assert(res.recibido === 485 && res.pagos === 7, "recibido hoy $485 en 7 pagos (sin vencidos, sin pruebas, sin ayer)");
assert(res.porPasarela.DeUna === 4 && res.porPasarela.PayPhone === 3, "por pasarela");
assert(res.pendientes === 3 && res.montoPendientes === 95, "3 por asignar o revisar · $95");
assert(res.comisiones === 17.19 && res.neto === 467.81, "comisiones $17,19 y neto $467,81 (maqueta 12)");

assert(etiquetaEstado("En revisión", false) === "Por revisar" && etiquetaEstado("Abierto", true) === "Vencido sin pago", "etiquetas del personal");
assert(cuentaDelResumen("PL-000027 · OR000551 · $105.00 · DeUna") === "OR000551" && cuentaDelResumen("PL-000030 · Sin referencia · $35.00 · DeUna") === "", "cuenta desde el texto principal");
assert(urlCuenta({ origen: "Orden", id: "recX" }) === "/tecnicos/ordenes/recX" && urlCuenta({ origen: "Pedido", id: "recY" }) === "/operaciones/recY", "enlace a la cuenta");

// ─── Sugerencias ───
const cands: Candidato[] = [
  { origen: "Orden", id: "r1", codigo: "OR000549", cliente: "Carlos Mendes", detalle: "", falta: 55, cedula: "1700000098" },
  { origen: "Pedido", id: "r2", codigo: "OP-151", cliente: "Carla Méndez", detalle: "", falta: 20, cedula: "1799999999" },
  { origen: "Orden", id: "r3", codigo: "OR000552", cliente: "María Fernanda Ruiz", detalle: "", falta: 35, cedula: "171-234-4521" },
  { origen: "Orden", id: "r4", codigo: "OR000500", cliente: "María Ruiz", detalle: "", falta: 10, cedula: "1712344521" },
];
const s1 = sugerir({ monto: 35, identificacion: "1712344521" }, cands);
assert(s1[0].codigo === "OR000552" && s1[0].mismaCedula && s1[0].mismoMonto, "misma cédula y mismo monto va primero (cédula con guiones se normaliza)");
assert(s1.slice(-2).every((x) => x.falta < 35), "las cuentas con menos saldo que el pago van al final");
assert(mejorSugerencia({ monto: 20, identificacion: "" }, cands)?.codigo === "OP-151", "sin cédula: sugiere por mismo monto");
assert(mejorSugerencia({ monto: 33, identificacion: "0911111111" }, cands) === null, "sin coincidencias: no sugiere nada (el empleado busca)");
assert(mejorSugerencia({ monto: 35, identificacion: "1712344521" }, [cands[3]]) === null, "misma cédula pero el pago no cabe: no sugiere");

// ─── Cierre del día ───
const c = cierre("DeUna", [
  { id: "m1", monto: 105, neto: 102.58, estado: "Pendiente", observacion: "" },
  { id: "m2", monto: 150, neto: 146.55, estado: "Acreditado", observacion: "" },
  { id: "m3", monto: 55, neto: 53.74, estado: "Pendiente", observacion: "" },
]);
assert(c.cobrado === 310 && c.neto === 302.87 && c.comision === 7.13, "DeUna: $310 − $7,13 = $302,87");
assert(c.porAcreditar === 2 && c.acreditados === 1, "2 por acreditar, 1 acreditado");

// ─── Excel y permisos ───
const csv = csvHistorial([f({ codigo: "PL-1", monto: 105, tarifa: 2.42, neto: 102.58, pagador: "Ana; Paredes" })]);
assert(csv.startsWith("﻿Fecha;Código") && csv.includes('"Ana; Paredes"') && csv.includes("105,00"), "CSV para Excel en español (; y coma decimal)");
assert(puedeVerBandeja("Administrador") && !puedeVerBandeja(undefined), "Administrador sí; sin sesión no");

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo bien.");

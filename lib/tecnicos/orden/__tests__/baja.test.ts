/**
 * Pruebas — política de baja unificada (rediseño R8, 24-nov-2026).
 * Ejecutar: npm test orden/__tests__/baja
 */
import { evaluarBaja, mensajeBaja, motivoReciclaje, planCompletadaEl, referenciaBaja } from "../baja";
import { getAbandonmentStatus } from "../../orders/abandonmentPolicy";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const ahora = new Date("2026-11-24T15:00:00Z");
const haceDias = (d: number) => new Date(ahora.getTime() - d * 86_400_000 - 3_600_000).toISOString();

// Esperando Respuesta: desde el ingreso
{
  const b = evaluarBaja({ estado: "Esperando Respuesta", fechaIngreso: haceDias(105) }, ahora);
  assert(b?.nivel === "cumple" && b.dias === 105 && b.desde === "ingreso", "esperando respuesta con 105 días desde el ingreso: cumple la política");
  const p = evaluarBaja({ estado: "Esperando Respuesta", fechaIngreso: haceDias(72) }, ahora);
  assert(p?.nivel === "proxima" && p.faltan === 18, "72 días: próxima a baja, faltan 18");
  assert(evaluarBaja({ estado: "Esperando Respuesta", fechaIngreso: haceDias(56) }, ahora) === null, "56 días: todavía no entra");
}

// Completado: solo si se avisó, y desde que se completó
{
  const sinAvisar = { estado: "Completado", fechaIngreso: haceDias(200), completadaEl: haceDias(120), clienteAvisado: null };
  assert(evaluarBaja(sinAvisar, ahora) === null, "completada sin avisar: no cuenta (antes suena «Cliente sin avisar»)");
  const avisada = { estado: "Completado", fechaIngreso: haceDias(150), completadaEl: haceDias(91), clienteAvisado: haceDias(90) };
  const b = evaluarBaja(avisada, ahora);
  assert(b?.nivel === "cumple" && b.dias === 91 && b.desde === "completada", "completada y avisada: cuenta desde que se completó (no desde el ingreso)");
  const reparacionLarga = { estado: "Completado", fechaIngreso: haceDias(100), completadaEl: haceDias(30), clienteAvisado: haceDias(30) };
  assert(evaluarBaja(reparacionLarga, ahora) === null, "si la reparación tardó, el cliente igual tiene sus 90 días desde que se completó");
  const antigua = { estado: "Completado", fechaIngreso: haceDias(150), estadoCambiadoEl: haceDias(70), clienteAvisado: haceDias(69) };
  assert(referenciaBaja(antigua)?.fecha === antigua.estadoCambiadoEl && evaluarBaja(antigua, ahora)?.nivel === "proxima", "completadas de antes de R8: usa «Estado cambiado el»");
}

// Pendiente y En Proceso no cuentan
assert(evaluarBaja({ estado: "En Proceso", fechaIngreso: haceDias(120) }, ahora) === null, "en proceso (equipo en nuestras manos): no cuenta aunque lleve 120 días");
assert(evaluarBaja({ estado: "Pendiente", fechaIngreso: haceDias(120) }, ahora) === null, "pendiente: no cuenta");
assert(evaluarBaja({ estado: "Enviado a Reciclaje", fechaIngreso: haceDias(120) }, ahora) === null, "cerradas: no cuentan");

// Textos
{
  const b = evaluarBaja({ estado: "Completado", fechaIngreso: haceDias(150), completadaEl: haceDias(95), clienteAvisado: haceDias(95) }, ahora)!;
  assert(mensajeBaja(b).includes("completada y avisada") && mensajeBaja(b).includes("reciclaje"), "mensaje de la franja dice desde cuándo y qué hacer");
  assert(motivoReciclaje(b).includes("desde que se completó"), "lo que queda en la Actividad dice desde cuándo se contó");
}

// La forma vieja (orden, WhatsApp, ruta) usa la misma regla
{
  const s = getAbandonmentStatus({ estadoActual: "Esperando Respuesta", fechaIngreso: haceDias(96), ultimaModificacion: haceDias(1) }, ahora);
  assert(s.level === "critical" && s.daysWaiting === 96 && s.desde === "ingreso", "getAbandonmentStatus cuenta desde el ingreso (no desde la última modificación)");
  const c = getAbandonmentStatus({ estadoActual: "Completado", fechaIngreso: haceDias(96), completadaEl: haceDias(65), clienteAvisado: haceDias(64) }, ahora);
  assert(c.level === "warning" && c.label === "Próxima a baja", "getAbandonmentStatus también para completadas avisadas");
  assert(getAbandonmentStatus({ estadoActual: "En Proceso", fechaIngreso: haceDias(200) }, ahora).level === "none", "en proceso: nada");
}

// Llenado de «Completada el»
{
  const plan = planCompletadaEl([
    { id: "a", codigo: "OR1", estado: "Completado", estadoCambiadoEl: "2026-11-20T10:00:00Z", clienteAvisado: "2026-11-21T10:00:00Z" },
    { id: "b", codigo: "OR2", estado: "Completado", completadaEl: "2026-11-01T10:00:00Z" },
    { id: "c", codigo: "OR3", estado: "En Proceso", estadoCambiadoEl: "2026-11-20T10:00:00Z" },
    { id: "d", codigo: "OR4", estado: "Completado", clienteAvisado: "2026-11-02T10:00:00Z" },
  ]);
  assert(plan.length === 2 && plan[0].fecha === "2026-11-20T10:00:00Z" && plan[1].de === "cuando se avisó al cliente", "llena solo las completadas vacías: estado cambiado o, si no, aviso");
}

if (fallos > 0) { console.error(`\n${fallos} fallo(s).`); process.exit(1); }
console.log("\nTodo bien.");

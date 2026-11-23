/**
 * Test de reglas — alertas de atención de las órdenes (rediseño R10, tableros 10 y 11).
 * Ejecutar: npm test alertas/__tests__/reglas
 */
import {
  CONFIG_INICIAL, cuentaComoMovimiento, evaluarOrden, leerHora, leerPlazo, llegadaPrevista, mezclarConfig,
  minutosHabiles, proximoDiaHabil, resumenAlertas, revisarConfig, revisarPosponer, situaciones, textoHace, textoHora,
  type LineaAlerta, type OrdenAlerta,
} from "../reglas";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}
const H = CONFIG_INICIAL.horario;
// Hora de Ecuador (UTC−5) → ISO
const ec = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00-05:00`);

// ─── Reloj del taller ────────────────────────────────────────────────────────
// 24-nov-2026 es martes; 28 sábado; 29 domingo.
assert(minutosHabiles(ec("2026-11-24", "10:00"), ec("2026-11-24", "12:00"), H) === 120, "2 h dentro del mismo día");
assert(minutosHabiles(ec("2026-11-24", "08:00"), ec("2026-11-24", "10:00"), H) === 30, "antes de abrir no cuenta (abre 9:30)");
assert(minutosHabiles(ec("2026-11-24", "17:00"), ec("2026-11-25", "10:30"), H) === 120, "de 17:00 a 10:30 del día siguiente = 1 h + 1 h");
assert(minutosHabiles(ec("2026-11-28", "08:00"), ec("2026-11-30", "09:30"), H) === 300, "sábado 9–14 cuenta (5 h); domingo no");
assert(minutosHabiles(ec("2026-11-29", "10:00"), ec("2026-11-29", "16:00"), H) === 0, "domingo no cuenta");
assert(minutosHabiles(ec("2026-11-24", "12:00"), ec("2026-11-24", "10:00"), H) === 0, "al revés da 0");
assert(minutosHabiles(ec("2026-11-28", "10:00"), ec("2026-11-28", "12:00"), { ...H, sab: null }) === 0, "si el sábado no cuenta, da 0");
assert(textoHace(30, H) === "<1 h" && textoHace(185, H) === "3 h" && textoHace(510 * 2 + 10, H) === "2 d", "«<1 h», «3 h», «2 d» (jornada de 8,5 h)");
assert(leerHora("9:30") === 570 && leerHora("18") === 1080 && leerHora("25:00") === null && textoHora(570) === "9\x3a30", "horas en minutos (9:30 = 570)");
const p = leerPlazo("4 h"), d = leerPlazo("1,5 d");
assert(p !== "error" && p?.n === 4 && p.u === "h" && d !== "error" && d?.n === 1.5 && d.u === "d", "plazos «4 h» y «1,5 d»");
assert(leerPlazo("") === null && leerPlazo("—") === null && leerPlazo("mucho") === "error", "plazo vacío = sin ámbar; texto raro = error");

// ─── Situaciones ─────────────────────────────────────────────────────────────
const base: OrdenAlerta = {
  id: "rec1", codigo: "OR000001", estado: "Pendiente", fechaIngreso: ec("2026-11-23", "10:00").toISOString(),
  responsableId: "recU", ultimoMovimiento: null, pospuestaHasta: null, clienteAvisado: null, presupuestoEnviado: null, lineas: [],
};
const linea = (x: Partial<LineaAlerta>): LineaAlerta => ({
  estado: "Aprobada", estadoTrabajo: "Por hacer", motivoEspera: "", trabajoEn: null, fechaAprobacion: ec("2026-11-23", "11:00").toISOString(),
  bajoPedido: false, tiempoEstimado: "", descripcion: "Trabajo", ...x,
});
const ahora = ec("2026-11-25", "12:00"); // miércoles
const claves = (o: OrdenAlerta) => situaciones(o, ahora).map((s) => s.clave);

assert(claves({ ...base, estado: "Finalizado Entregado" }).length === 0, "orden cerrada: nada");
assert(claves({ ...base, responsableId: null }).includes("sinResponsable"), "sin responsable siempre suena");
assert(claves(base).join() === "sinPresupuesto", "sin líneas → «Sin presupuesto»");
assert(claves({ ...base, lineas: [linea({ estado: "Pendiente" })] }).join() === "presupuestoSinEnviar", "con líneas sin enviar → «Presupuesto sin enviar»");
assert(claves({ ...base, estado: "Esperando Respuesta", lineas: [linea({ estado: "Pendiente" })] }).join() === "clienteNoResponde", "esperando respuesta → «Cliente no responde»");
assert(claves({ ...base, estado: "Esperando Respuesta", ultimoMovimiento: ec("2026-09-01", "10:00").toISOString(), fechaIngreso: ec("2026-08-01", "10:00").toISOString() }).length === 0,
  "60 días o más esperando: ya es de la política de baja (no suena aquí)");
assert(claves({ ...base, lineas: [linea({})] }).join() === "aprobadoSinEmpezar", "aprobado y nada empezado → «Aprobado, sin empezar»");
assert(claves({ ...base, lineas: [linea({ estadoTrabajo: "En curso" })] }).join() === "sinAvance", "empezado → «Sin avance»");
assert(claves({ ...base, lineas: [linea({ estadoTrabajo: "Hecho" })] }).join() === "todoHecho", "todo hecho → «Todo hecho, sin completar»");
assert(claves({ ...base, lineas: [linea({ estadoTrabajo: "En espera", motivoEspera: "Respuesta del cliente" })] }).join() === "esperaCliente", "en espera del cliente → «Esperando al cliente»");
assert(claves({ ...base, estado: "Completado" }).join() === "sinAvisar", "completado sin avisar → «Cliente sin avisar»");
assert(claves({ ...base, estado: "Completado", clienteAvisado: ec("2026-11-24", "10:00").toISOString() }).join() === "noRetira", "completado y avisado → «Avisado, no retira»");

// Repuesto: día que aprobó + tiempo estimado de la línea
const rep = linea({ estadoTrabajo: "En espera", motivoEspera: "Repuesto", tiempoEstimado: "2 a 3 semanas", fechaAprobacion: ec("2026-11-02", "10:00").toISOString() });
assert(llegadaPrevista(rep) === "2026-11-23", "«2 a 3 semanas» desde el 2-nov → llega a más tardar el 23-nov");
assert(claves({ ...base, lineas: [rep] }).join() === "repuestoAtrasado", "pasada la fecha → «Repuesto atrasado»");
assert(claves({ ...base, lineas: [{ ...rep, fechaAprobacion: ec("2026-11-20", "10:00").toISOString() }] }).length === 0, "repuesto aún a tiempo: no suena");
assert(claves({ ...base, lineas: [{ ...rep, tiempoEstimado: "" }] }).length === 0, "repuesto sin tiempo estimado: no hay fecha, no suena");
const alertaRep = evaluarOrden({ ...base, lineas: [rep] }, CONFIG_INICIAL, ahora);
assert(alertaRep?.nivel === "atencion" && alertaRep.texto === "Repuesto atrasado (llegaba 23 nov)", "el repuesto atrasado va en rojo y dice cuándo llegaba");

// Semáforo y tiempos
const sinPres = (desde: string) => evaluarOrden({ ...base, fechaIngreso: desde }, CONFIG_INICIAL, ahora);
assert(sinPres(ec("2026-11-25", "10:00").toISOString())?.nivel === "alDia", "sin presupuesto 2 h → al día");
assert(sinPres(ec("2026-11-24", "11:00").toISOString())?.nivel === "porVencer", "sin presupuesto 1 jornada → ámbar (1 d)");
assert(sinPres(ec("2026-11-23", "10:00").toISOString())?.nivel === "atencion", "sin presupuesto 2 jornadas → rojo (2 d)");
const peor = evaluarOrden({ ...base, responsableId: null, fechaIngreso: ec("2026-11-23", "10:00").toISOString() }, CONFIG_INICIAL, ahora);
assert(peor?.nivel === "atencion", "manda la situación más atrasada");
const pospuesta = evaluarOrden({ ...base, fechaIngreso: ec("2026-11-20", "10:00").toISOString(), pospuestaHasta: ec("2026-11-27", "09:30").toISOString() }, CONFIG_INICIAL, ahora);
assert(pospuesta?.nivel === "alDia" && !!pospuesta.pospuestaHasta, "pospuesta: no suena hasta la fecha");
const vencida = evaluarOrden({ ...base, fechaIngreso: ec("2026-11-20", "10:00").toISOString(), pospuestaHasta: ec("2026-11-24", "09:30").toISOString() }, CONFIG_INICIAL, ahora);
assert(vencida?.nivel === "atencion", "pasada la fecha de posponer vuelve a sonar");
const r = resumenAlertas([
  { ordenId: "a", codigo: "A", responsableId: "yo", alerta: { ...peor!, nivel: "atencion" } },
  { ordenId: "b", codigo: "B", responsableId: null, alerta: { ...peor!, clave: "sinResponsable", nivel: "porVencer" } },
  { ordenId: "c", codigo: "C", responsableId: "otro", alerta: { ...peor!, nivel: "alDia" } },
], "yo");
assert(r.atencion === 1 && r.porVencer === 1 && r.mias === 1, "resumen: rojas, ámbar y mías (las al día no cuentan)");

// ─── Posponer ────────────────────────────────────────────────────────────────
assert(proximoDiaHabil(ec("2026-11-27", "12:00"), H) === "2026-11-28", "viernes → mañana es sábado (cuenta)");
assert(proximoDiaHabil(ec("2026-11-28", "12:00"), H) === "2026-11-30", "sábado → lunes (domingo no cuenta)");
const pos = revisarPosponer({ hasta: "2026-11-26", motivo: "Cliente viaja" }, ahora, H);
assert(pos.ok && pos.hasta === "2026-11-26T14:30:00.000Z", "pospuesta hasta la hora de abrir de ese día (9:30 Ecuador)");
assert(!revisarPosponer({ hasta: "2026-11-25", motivo: "Cliente viaja" }, ahora, H).ok, "no se pospone para hoy");
assert(!revisarPosponer({ hasta: "2026-11-26", motivo: "ok" }, ahora, H).ok, "el motivo es obligatorio");

// ─── Ajustes ─────────────────────────────────────────────────────────────────
assert(mezclarConfig(null).plazos.sinPresupuesto.atencion?.n === 2, "sin ajustes guardados: los del tablero 11");
assert(mezclarConfig({ horario: { lunVie: { desde: 540, hasta: 1080 }, sab: null } }).horario.sab === null, "se puede quitar el sábado");
const malo = revisarConfig({ horario: H, plazos: { ...CONFIG_INICIAL.plazos, sinAvance: { porVencer: { n: 3, u: "d" }, atencion: { n: 2, u: "d" } } } });
assert(!malo.ok, "el ámbar debe llegar antes que el rojo");
const sinRojo = revisarConfig({ horario: H, plazos: { ...CONFIG_INICIAL.plazos, sinAvance: { porVencer: null, atencion: null } } });
assert(!sinRojo.ok, "cada situación necesita su tiempo de atención");
assert(revisarConfig({ horario: H, plazos: CONFIG_INICIAL.plazos }).ok, "los ajustes iniciales son válidos");

// ─── Último movimiento ───────────────────────────────────────────────────────
assert(cuentaComoMovimiento("Nota") && cuentaComoMovimiento("") && cuentaComoMovimiento(null), "notas y cambios cuentan como movimiento");
assert(!cuentaComoMovimiento("Contraseña vista") && !cuentaComoMovimiento("Alerta pospuesta") && !cuentaComoMovimiento("Responsable"),
  "ver la contraseña, posponer o cambiar responsable no cuentan");

if (fallos > 0) { console.error(`\n${fallos} fallo(s).`); process.exit(1); }
console.log("\nTodo bien.");

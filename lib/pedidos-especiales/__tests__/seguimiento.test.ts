/**
 * Test — seguimiento del pedido especial (punto 10B).
 * Ejecutar: npm test seguimiento
 */
import {
  AVISO_HABLAR, AVISO_RETRASO, construirSeguimiento, corregirLlegada, deshacerUltimoManual, diasDeTiempo, leerGuardado,
  llegadaEstimada, marcarSiguiente, ponerAviso, quitarAviso, seguimientoParaCliente, textoRango, conVistos,
  type SenalArticulo, type SeguimientoGuardado,
} from "../seguimiento";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

// 1. Tiempo de llegada → días
assert(JSON.stringify(diasDeTiempo("24 horas")) === "[1,1]", "24 horas → 1 día");
assert(JSON.stringify(diasDeTiempo("2 a 3 días")) === "[2,3]", "2 a 3 días");
assert(JSON.stringify(diasDeTiempo("1 semana")) === "[7,7]", "1 semana");
assert(JSON.stringify(diasDeTiempo("2 a 3 semanas")) === "[14,21]", "2 a 3 semanas");
assert(JSON.stringify(diasDeTiempo("1 mes")) === "[30,30]", "1 mes");
assert(JSON.stringify(diasDeTiempo("12–15 días")) === "[12,15]", "12–15 días (texto libre)");
assert(JSON.stringify(diasDeTiempo("5-7 dias")) === "[5,7]", "5-7 dias sin tilde");
assert(diasDeTiempo("Por confirmar") === null && diasDeTiempo("") === null, "por confirmar / vacío → sin fecha");

// 2. Llegada estimada (decisión 3): desde la confirmación, lo más lento manda
const est = llegadaEstimada({ confirmadoEn: "2026-11-04T19:00:00Z", tiempos: ["2 a 3 semanas", "1 semana"] });
assert(!!est && est.desde === "2026-11-18" && est.hasta === "2026-11-25" && !est.corregida, "aceptado 4-nov, 2 a 3 semanas → 18 a 25 nov");
assert(textoRango("2026-11-18", "2026-11-20") === "mié 18 – vie 20 nov", "texto del rango");
assert(textoRango("2026-11-28", "2026-12-02") === "sáb 28-nov – mié 2-dic", "rango entre meses");
const corr = llegadaEstimada({ confirmadoEn: "2026-11-04T19:00:00Z", tiempos: ["1 semana"], corregida: { desde: "2026-11-30", hasta: "2026-12-02", por: "Diana" } });
assert(!!corr && corr.desde === "2026-11-30" && corr.corregida, "la corrección del empleado manda");
assert(llegadaEstimada({ confirmadoEn: "2026-11-04T19:00:00Z", tiempos: ["Por confirmar"] }) === null, "sin tiempo → sin estimado");

// 3. Hitos automáticos desde Shipping
const art = (x: Partial<SenalArticulo> = {}): SenalArticulo => ({ compradoEn: null, enviado: false, enCasillero: false, haciaEcuador: false, fleteEn: null, recibidoEn: null, ...x });
const AHORA = new Date("2026-11-12T15:00:00Z");
const base = { estado: "Aceptado", ruta: "extranjero" as const, confirmadoEn: "2026-11-04T19:00:00Z", tiempos: ["2 a 3 semanas"], guardado: {} as SeguimientoGuardado, ahora: AHORA };

const s0 = construirSeguimiento({ ...base, articulos: [art()] });
assert(s0.actual?.clave === "confirmado" && s0.hitos.length === 8, "pagado y sin comprar: Pedido confirmado (8 pasos)");
assert(s0.siguienteManual === null, "comprar lo marca el sistema, no el empleado");

const s1 = construirSeguimiento({ ...base, articulos: [art({ compradoEn: "2026-11-05T15:00:00Z" })] });
assert(s1.actual?.clave === "comprado" && s1.actual.fecha === "2026-11-05T15:00:00Z", "comprado con la fecha de compra");
assert(s1.siguienteManual?.clave === "enviado", "si Logística no pone el rastreo, el empleado puede marcar Enviado");

const s2 = construirSeguimiento({ ...base, articulos: [art({ compradoEn: "2026-11-05T15:00:00Z", enviado: true })] });
assert(s2.actual?.clave === "enviado" && s2.nuevosVistos.enviado === AHORA.toISOString(), "rastreo → Enviado, fechado hoy (primera vez que se ve)");
const s2b = construirSeguimiento({ ...base, articulos: [art({ compradoEn: "x", enviado: true })], guardado: conVistos({}, s2.nuevosVistos), ahora: new Date("2026-11-13T15:00:00Z") });
assert(s2b.actual?.fecha === AHORA.toISOString() && Object.keys(s2b.nuevosVistos).length === 0, "al día siguiente conserva la fecha guardada");

const s3 = construirSeguimiento({ ...base, articulos: [art({ compradoEn: "x", enviado: true, enCasillero: true })] });
assert(s3.actual?.clave === "preparando", "en la caja / por empacar → Preparándose para viajar");

const s4 = construirSeguimiento({ ...base, articulos: [art({ compradoEn: "x", enCasillero: true, haciaEcuador: true, fleteEn: "2026-11-11T14:00:00Z" })] });
assert(s4.actual?.clave === "en_camino" && s4.actual.fecha === "2026-11-11T14:00:00Z", "flete a Ecuador pagado → En camino, con la fecha del pago");
assert(s4.siguienteManual?.clave === "aduana", "aduana: manual");

const s5 = construirSeguimiento({ ...base, articulos: [art({ compradoEn: "x", recibidoEn: "2026-11-19T16:00:00Z" })] });
assert(s5.actual?.clave === "llego" && s5.actual.fecha === "2026-11-19T16:00:00Z", "Recepción → ¡Llegó!, con la fecha de recepción");
assert(s5.hitos.find((h) => h.clave === "en_camino")?.estado === "hecho" && s5.hitos.find((h) => h.clave === "en_camino")?.fecha === "", "los pasos saltados quedan hechos, sin fecha inventada");
assert(s5.siguienteManual === null, "¡Llegó! nunca a mano; después solo Entregar");

// 4. Varios artículos: manda el más atrasado
const s6 = construirSeguimiento({ ...base, articulos: [art({ compradoEn: "x", recibidoEn: "2026-11-19T16:00:00Z" }), art({ compradoEn: "x", enviado: true })] });
assert(s6.actual?.clave === "enviado", "uno llegó y otro va enviado → Enviado");

// 5. Manual
const g1 = marcarSiguiente({}, s4, "Diana", new Date("2026-11-14T15:00:00Z"));
const s7 = construirSeguimiento({ ...base, articulos: [art({ compradoEn: "x", haciaEcuador: true })], guardado: g1 });
assert(s7.actual?.clave === "aduana" && s7.actual.manual && s7.actual.fecha === "2026-11-14T15:00:00.000Z", "Siguiente → En proceso de aduana");
let error = "";
try { marcarSiguiente({}, s5, "Diana"); } catch (e) { error = (e as Error).message; }
assert(error.includes("lo marca el sistema"), "no se puede marcar ¡Llegó! a mano");
const g2 = deshacerUltimoManual(g1, s7);
assert(!g2.manuales?.aduana, "deshacer el último paso manual");
const sLlego = construirSeguimiento({ ...base, articulos: [art({ compradoEn: "x", recibidoEn: "2026-11-19T16:00:00Z" })], guardado: g1 });
assert(sLlego.actual?.clave === "llego", "lo manual no frena lo automático");

// 6. Ruta local
const sl = construirSeguimiento({ ...base, ruta: "local", articulos: [art({ compradoEn: "x", enviado: true })] });
assert(sl.hitos.length === 5 && sl.actual?.clave === "en_camino_tienda", "local: Comprado → En camino a la tienda");

// 7. Entregado y antes de confirmar
const se = construirSeguimiento({ ...base, estado: "Entregado", entregadoEn: "2026-11-21T20:00:00Z", articulos: [art({ compradoEn: "x", recibidoEn: "y" })] });
assert(se.actual?.clave === "entregado" && se.actual.fecha === "2026-11-21T20:00:00Z", "entregado");
const sp = construirSeguimiento({ ...base, estado: "Esperando al cliente", articulos: [] });
assert(sp.actual === null && sp.llegada === null && sp.siguienteManual === null, "sin confirmar: no hay seguimiento");

// 8. Avisos
const tarde = construirSeguimiento({ ...base, articulos: [art({ compradoEn: "x" })], ahora: new Date("2026-11-27T15:00:00Z") });
assert(tarde.retraso && tarde.aviso === AVISO_RETRASO, "pasó el 25-nov y no llegó → Con un poco de retraso");
const llegoTarde = construirSeguimiento({ ...base, articulos: [art({ compradoEn: "x", recibidoEn: "2026-11-27T10:00:00Z" })], ahora: new Date("2026-11-27T15:00:00Z") });
assert(!llegoTarde.retraso, "si ya llegó, no hay retraso");
const gA = ponerAviso({}, "El proveedor canceló: ofrecer el Dell", "Alex");
const sa = construirSeguimiento({ ...base, articulos: [art()], guardado: gA });
assert(sa.aviso === AVISO_HABLAR && !!sa.avisoInterno?.nota.includes("Dell"), "Necesitamos hablar contigo (nota interna aparte)");
const cli = seguimientoParaCliente(sa);
assert(!JSON.stringify(cli).includes("Dell") && cli.aviso === AVISO_HABLAR, "el cliente NO ve la nota");
assert(quitarAviso(gA).aviso === null, "se quita a mano");
let e2 = "";
try { ponerAviso({}, "  ", "Alex"); } catch (e) { e2 = (e as Error).message; }
assert(!!e2, "el aviso exige nota");

// 9. Corregir llegada y leer el JSON
const gL = corregirLlegada({}, "2026-11-30", "2026-12-02", "Diana");
assert(gL.llegada?.desde === "2026-11-30", "corrige la llegada");
let e3 = "";
try { corregirLlegada({}, "2026-12-02", "2026-11-30", "Diana"); } catch (e) { e3 = (e as Error).message; }
assert(!!e3, "fecha final antes de la inicial → error");
assert(JSON.stringify(leerGuardado("no-json")) === "{}" && JSON.stringify(leerGuardado("")) === "{}", "JSON roto o vacío → vacío");
assert(seguimientoParaCliente(s5).llegada === null, "ya llegó: el cliente no ve 'llega aprox.'");

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo OK");

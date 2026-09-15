// Contrato del respaldo de la inspección técnica.
// Ejecutar: npx tsx lib/shipping-v2/__tests__/revision-tecnica-snapshot.test.ts

import { construirZonasRevision } from "../revision-tecnica";
import {
  actualizarEquipamiento,
  confirmarEquipamiento,
  contarFallas,
  crearSnapshotVacio,
  equipamientoConfirmado,
  fallasCriticas,
  guardarObservacion,
  limpiarHuerfanos,
  marcarPunto,
  parsearSnapshot,
  resultadosDe,
  serializarSnapshot,
} from "../revision-tecnica-snapshot";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const AHORA = "2026-09-15T21:00:00.000Z";
const YO = "Alexis Bolaños";

// ─── Leer nunca puede romperse ──────────────────────────────────────────────
//
// El campo es texto libre en Airtable: cualquiera puede escribir ahí. Una
// inspección que no se puede abrir es peor que una vacía.

assert(parsearSnapshot(null).puntos && true, "null devuelve un snapshot vacío usable");
assert(Object.keys(parsearSnapshot("").puntos).length === 0, "Cadena vacía no rompe");
assert(Object.keys(parsearSnapshot("esto no es json").puntos).length === 0, "Texto plano no rompe");
assert(Object.keys(parsearSnapshot("[1,2,3]").puntos).length === 0, "Un array tampoco");
assert(Object.keys(parsearSnapshot("42").puntos).length === 0, "Un número tampoco");
assert(parsearSnapshot(undefined, "Laptop").categoria === "Laptop", "Sin datos, conserva la categoría que se le pasa");

// Basura parcial: se conserva lo bueno y se descarta lo malo.
const mezclado = parsearSnapshot(JSON.stringify({
  version: 1, categoria: "Laptop",
  puntos: {
    bueno: { r: "ok", txt: "Enciende", por: YO, en: AHORA },
    invalido: { r: "quizas", txt: "Algo", por: YO, en: AHORA },
    roto: "no soy un objeto",
    vacio: null,
  },
  equipamiento: {
    opciones: [
      { nombre: "Wi-Fi", grupo: "conectividad" },
      { nombre: "", grupo: "puerto" },
      { nombre: "Raro", grupo: "grupo-que-no-existe" },
      "ni siquiera un objeto",
    ],
    confirmadoPor: YO, confirmadoEn: AHORA,
  },
  observaciones: { pantalla: "Se ve bien", vacia: "   " },
}));
assert(Object.keys(mezclado.puntos).length === 1, "De cuatro puntos con basura, sobrevive el bueno");
assert(mezclado.puntos.bueno.r === "ok", "Y sobrevive con su valor correcto");
assert(mezclado.equipamiento.opciones.length === 1, "De cuatro opciones con basura, sobrevive la buena");
assert(mezclado.equipamiento.opciones[0].nombre === "Wi-Fi", "Con su nombre");
assert(Object.keys(mezclado.observaciones).length === 1, "Una observación en blanco no se guarda");

// ─── Ida y vuelta ───────────────────────────────────────────────────────────

const zonas = construirZonasRevision("Laptop", [{ nombre: "Touch ID", grupo: "extra" }]);
const p1 = zonas[0].puntos[0];

let s = crearSnapshotVacio("Laptop");
s = marcarPunto(s, { puntoId: p1.id, texto: p1.texto, resultado: "ok", actor: YO, ahora: AHORA });
const volvio = parsearSnapshot(serializarSnapshot(s));
assert(volvio.puntos[p1.id]?.r === "ok", "Guardar y volver a leer conserva el resultado");
assert(volvio.puntos[p1.id]?.por === YO, "Conserva quién lo marcó");
assert(volvio.puntos[p1.id]?.en === AHORA, "Conserva cuándo");

// El texto viaja con el resultado: si mañana cambiamos la redacción del punto,
// la inspección vieja se sigue entendiendo.
assert(volvio.puntos[p1.id]?.txt === p1.texto, "El texto del punto se guarda junto al resultado");

// ─── Marcar y desmarcar ─────────────────────────────────────────────────────

const desmarcado = marcarPunto(s, { puntoId: p1.id, texto: p1.texto, resultado: null, actor: YO, ahora: AHORA });
assert(!desmarcado.puntos[p1.id], "Pasar null borra el resultado");
assert(desmarcado.actualizadoPor === YO, "Desmarcar también deja huella de quién");

// Las mutaciones no tocan el original.
assert(!!s.puntos[p1.id], "Marcar devuelve un snapshot nuevo, no modifica el que recibe");

// ─── Firma del equipamiento ─────────────────────────────────────────────────

let conEquipo = crearSnapshotVacio("Laptop");
assert(!equipamientoConfirmado(conEquipo), "Un snapshot nuevo no tiene el equipamiento confirmado");

conEquipo = confirmarEquipamiento(conEquipo, {
  opciones: [{ nombre: "Wi-Fi", grupo: "conectividad" }], actor: YO, ahora: AHORA,
});
assert(equipamientoConfirmado(conEquipo), "Confirmar lo deja firmado");
assert(conEquipo.equipamiento.confirmadoPor === YO, "Con el nombre de quien firmó");

// Cambiar lo declarado tumba la firma: ya no es lo mismo que se firmó.
const cambiado = actualizarEquipamiento(conEquipo, {
  opciones: [{ nombre: "Wi-Fi", grupo: "conectividad" }, { nombre: "Touch ID", grupo: "extra" }],
  actor: YO, ahora: AHORA,
});
assert(!equipamientoConfirmado(cambiado), "Agregar una característica tumba la firma anterior");
assert(cambiado.equipamiento.opciones.length === 2, "Pero sí guarda lo nuevo declarado");

// ─── Huérfanos ──────────────────────────────────────────────────────────────
//
// El caso real: el técnico marcó el lector de huella como falla y después se
// da cuenta de que el equipo no lo trae. Al desmarcarlo, el punto desaparece
// y su resultado NO puede quedar colgado inflando el conteo de fallas.

const puntoHuella = zonas.flatMap((z) => z.puntos).find((p) => p.declaradoDe === "Touch ID")!;
let conHuella = crearSnapshotVacio("Laptop");
conHuella = marcarPunto(conHuella, { puntoId: puntoHuella.id, texto: puntoHuella.texto, resultado: "falla", actor: YO, ahora: AHORA });
conHuella = marcarPunto(conHuella, { puntoId: p1.id, texto: p1.texto, resultado: "ok", actor: YO, ahora: AHORA });
assert(contarFallas(conHuella) === 1, "Antes de limpiar hay una falla");

const sinHuella = construirZonasRevision("Laptop", []);
const limpio = limpiarHuerfanos(conHuella, sinHuella);
assert(limpio.descartados === 1, "Al quitar la declaración se descarta su resultado");
assert(contarFallas(limpio.snapshot) === 0, "Y la falla ya no cuenta");
assert(!!limpio.snapshot.puntos[p1.id], "Los puntos que siguen vigentes no se tocan");

// Sin huérfanos, devuelve el mismo objeto: así quien llama sabe que no hay que escribir.
assert(limpiarHuerfanos(limpio.snapshot, sinHuella).snapshot === limpio.snapshot,
  "Si no hay nada que limpiar, no se crea un snapshot nuevo");

// Una observación de una zona que ya no existe también se va.
let conObs = guardarObservacion(crearSnapshotVacio("Laptop"), { zonaId: "zona-fantasma", nota: "algo", actor: YO, ahora: AHORA });
assert(Object.keys(limpiarHuerfanos(conObs, sinHuella).snapshot.observaciones).length === 0,
  "Una observación de una zona inexistente se descarta");

// ─── Observaciones ──────────────────────────────────────────────────────────

let obs = guardarObservacion(crearSnapshotVacio("Laptop"), { zonaId: "pantalla", nota: "  Rayón leve  ", actor: YO, ahora: AHORA });
assert(obs.observaciones.pantalla === "Rayón leve", "La observación se guarda sin espacios de sobra");
obs = guardarObservacion(obs, { zonaId: "pantalla", nota: "   ", actor: YO, ahora: AHORA });
assert(!obs.observaciones.pantalla, "Vaciar la observación la borra en vez de dejar un espacio");

// ─── Conteo de fallas acotado a lo vigente ──────────────────────────────────

let mixto = crearSnapshotVacio("Laptop");
mixto = marcarPunto(mixto, { puntoId: p1.id, texto: p1.texto, resultado: "falla", actor: YO, ahora: AHORA });
mixto = marcarPunto(mixto, { puntoId: "punto-que-no-existe", texto: "viejo", resultado: "falla", actor: YO, ahora: AHORA });
assert(contarFallas(mixto) === 2, "Sin zonas, cuenta todo lo que diga falla");
assert(contarFallas(mixto, zonas) === 1, "Con zonas, solo cuenta las fallas de puntos vigentes");

// ─── Fallas críticas ────────────────────────────────────────────────────────

const critico = zonas.flatMap((z) => z.puntos).find((p) => p.critico)!;
let conCritica = crearSnapshotVacio("Laptop");
conCritica = marcarPunto(conCritica, { puntoId: critico.id, texto: critico.texto, resultado: "falla", actor: YO, ahora: AHORA });
const criticas = fallasCriticas(conCritica, zonas);
assert(criticas.length === 1, "Una falla en punto crítico se lista");
assert(!!criticas[0].zona && !!criticas[0].punto, "Con su zona y su punto, para poder abrir la novedad");

const noCritico = zonas.flatMap((z) => z.puntos).find((p) => !p.critico)!;
let conLeve = crearSnapshotVacio("Laptop");
conLeve = marcarPunto(conLeve, { puntoId: noCritico.id, texto: noCritico.texto, resultado: "falla", actor: YO, ahora: AHORA });
assert(fallasCriticas(conLeve, zonas).length === 0, "Una falla en punto no crítico no entra en la lista");

// ─── Puente con revision-tecnica ────────────────────────────────────────────

assert(resultadosDe(mixto)[p1.id] === "falla", "resultadosDe entrega lo que esperan las funciones de estado");

if (fallos > 0) {
  console.error(`Fallaron ${fallos} comprobaciones.`);
  process.exit(1);
}
console.log("✅ revision-tecnica-snapshot.test.ts — todos los asserts pasaron");

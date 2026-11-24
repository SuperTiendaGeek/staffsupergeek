/**
 * Pruebas — lista de órdenes como tablero por etapas (rediseño R8, tableros 16 a 20).
 * Ejecutar: npm test orden/__tests__/tablero
 */
import { readFileSync } from "node:fs";
import {
  COLUMNAS, coincide, columnasDelTablero, filasAbiertas, filasParaBaja, leerVista, nombreEstado, pasaFiltro, tipoFila,
  type FilaTablero,
} from "../tablero";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const fila = (x: Partial<FilaTablero>): FilaTablero => ({
  ordenId: "rec" + Math.random(), codigo: "OR000500", cliente: "Ana Ruiz", equipo: "HP Victus 15", estado: "En Proceso",
  responsableId: "recYo", fechaIngreso: "2026-11-01T10:00:00Z", nivel: "alDia", texto: "Reparando", hace: "1 d", minutos: 100,
  pospuestaHasta: null, baja: null, ...x,
});

assert(COLUMNAS.map((c) => c.estado).join() === "Pendiente,Esperando Respuesta,En Proceso,Completado", "cuatro columnas con los estados de siempre");

const filas = [
  fila({ codigo: "OR1", estado: "Pendiente", nivel: "atencion", minutos: 50 }),
  fila({ codigo: "OR2", estado: "En Proceso", nivel: "alDia", minutos: 900 }),
  fila({ codigo: "OR3", estado: "En Proceso", nivel: "atencion", minutos: 100 }),
  fila({ codigo: "OR4", estado: "En Proceso", nivel: "porVencer", minutos: 300 }),
  fila({ codigo: "OR5", estado: "En Proceso", nivel: "atencion", minutos: 400, responsableId: null }),
  fila({ codigo: "OR6", estado: "Esperando Respuesta", texto: "Cumple política de baja", baja: { nivel: "cumple", dias: 96, desde: "ingreso", fecha: "2026-08-20T10:00:00Z", faltan: 0 } }),
  fila({ codigo: "OR7", estado: "Esperando Respuesta", texto: "Cumple política de baja", baja: { nivel: "cumple", dias: 141, desde: "ingreso", fecha: "2026-07-06T10:00:00Z", faltan: 0 } }),
  fila({ codigo: "OR8", estado: "Esperando Respuesta", nivel: "atencion", minutos: 70 }),
  fila({ codigo: "OR9", estado: "Completado", cliente: "José Pérez", equipo: "MacBook Air 13" }),
];

{
  const cols = columnasDelTablero(filas, { filtro: null, buscar: "", yo: "recYo" });
  const proceso = cols.find((c) => c.col.estado === "En Proceso")!;
  assert(proceso.tarjetas.map((t) => t.codigo).join() === "OR5,OR3,OR4,OR2", "dentro de la columna: rojo primero (lo más atrasado arriba), luego ámbar, luego al día");
  assert(proceso.total === 4 && proceso.rojas === 2, "el encabezado cuenta todas y las rojas");
  const esperando = cols.find((c) => c.col.estado === "Esperando Respuesta")!;
  assert(esperando.tarjetas.map((t) => t.codigo).join() === "OR8" && esperando.baja.map((t) => t.codigo).join() === "OR7,OR6", "las de baja van aparte, al final, la que más días lleva primero");
  assert(esperando.total === 3 && esperando.rojas === 1, "el número de la columna incluye las de baja; el rojo no");
}
{
  const cols = columnasDelTablero(filas, { filtro: "atencion", buscar: "", yo: "recYo" });
  assert(cols.flatMap((c) => c.tarjetas).length === 4 && cols.every((c) => c.baja.length === 0), "filtro «Atención»: solo las rojas (las de baja no tienen alerta)");
  const sinResp = columnasDelTablero(filas, { filtro: "sinResponsable", buscar: "", yo: "recYo" }).flatMap((c) => c.tarjetas);
  assert(sinResp.length === 1 && sinResp[0].codigo === "OR5", "filtro «Sin responsable»");
  assert(pasaFiltro(fila({ nivel: "alDia" }), "mias", "recYo") === false && pasaFiltro(fila({ nivel: "porVencer" }), "mias", "recYo"), "«Mías» = mías que suenan (igual que el contador)");
}
{
  assert(coincide(fila({ codigo: "OR000546" }), "546") && coincide(fila({ cliente: "José Pérez" }), "jose") && coincide(fila({ equipo: "MacBook Air" }), "macbook"), "el buscador encuentra por código, cliente (sin tildes) o equipo");
  const cols = columnasDelTablero(filas, { filtro: null, buscar: "macbook", yo: null });
  assert(cols.flatMap((c) => [...c.tarjetas, ...c.baja]).map((t) => t.codigo).join() === "OR9", "buscar en el tablero deja solo las que coinciden");
}
{
  const ab = filasAbiertas(filas);
  assert(ab.length === filas.length && ["OR6", "OR7"].every((c) => ab.findIndex((x) => x.codigo === c) < ab.findIndex((x) => x.codigo === "OR4")), "«Abiertas» de la Lista: todas; las que cumplen baja pesan como rojo");
  assert(filasParaBaja(filas).map((x) => x.codigo).join() === "OR7,OR6", "«Para baja»: solo las de la política, más días primero");
}
assert(tipoFila("Enviado a Reciclaje", false) === "reciclaje" && tipoFila("Finalizado Entregado", false) === "entregada" && tipoFila("Esperando Respuesta", true) === "baja" && tipoFila("En Proceso", false) === "normal", "cómo se pinta cada fila de la Lista");
assert(nombreEstado("Finalizado Entregado") === "Entregada" && nombreEstado("Enviado a Reciclaje") === "Reciclaje" && nombreEstado("En Proceso") === "En proceso", "nombres cortos de los estados");
assert(leerVista(null) === "tablero" && leerVista("lista") === "lista" && leerVista("cobros") === "cobros" && leerVista("raro") === "tablero", "la vista recordada; por defecto el tablero");

// Tailwind lee lib/**: nada de corchetes con dos puntos
for (const p of ["lib/tecnicos/orden/tablero.ts", "lib/tecnicos/orden/baja.ts"]) {
  assert(!/\[[^\]\n\s]*:[^\]\n\s]*\]/.test(readFileSync(p, "utf8")), `${p} no tiene corchetes con «:» (rompen el CSS)`);
}

if (fallos > 0) { console.error(`\n${fallos} fallo(s).`); process.exit(1); }
console.log("\nTodo bien.");

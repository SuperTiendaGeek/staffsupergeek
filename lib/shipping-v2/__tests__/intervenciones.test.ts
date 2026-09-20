// Contrato del catálogo de mantenimientos y mejoras por tipo de item.
// Ejecutar: npx tsx lib/shipping-v2/__tests__/intervenciones.test.ts

import {
  getIntervencionesPorCategoria,
  getMantenimientosPorPerfil,
  getMejorasPorPerfil,
  intervencionAplica,
  todosLosDetalles,
} from "../intervenciones";
import { getPerfilRevision, type PerfilRevision } from "../revision-tecnica";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const igual2 = (cond: boolean, msg: string) => assert(cond, msg);

const PERFILES: PerfilRevision[] = [
  "laptop", "desktop", "allinone", "monitor", "tablet", "consola",
  "ram", "disco", "grafica", "mainboard", "fuente", "bateria",
  "cargador", "pantalla-repuesto", "teclado-repuesto",
  "celular", "disco-externo", "smarthome", "audio", "impresora",
  "red", "camara", "energia", "adaptador", "insumo",
  "generico",
];

// ── Lo que no puede faltar nunca ────────────────────────────────────────────
for (const perfil of PERFILES) {
  const mant = getMantenimientosPorPerfil(perfil);
  const mej = getMejorasPorPerfil(perfil);
  assert(mant.length > 0 && mej.length > 0, `${perfil}: ambas listas tienen opciones`);
  assert(mant.includes("Otro") && mej.includes("Otro"), `${perfil}: siempre queda la salida "Otro"`);
  assert(new Set(mant).size === mant.length, `${perfil}: mantenimientos sin repetidos`);
  assert(new Set(mej).size === mej.length, `${perfil}: mejoras sin repetidos`);
}

// ── El caso que reportó el usuario ──────────────────────────────────────────
// "en un Disco Solido Nvme no va ha ser posible ajustar las bisagras, o en un
// monitor no va ha ser posible cambiar la pasta termica".
assert(
  !getMantenimientosPorPerfil("disco").includes("Ajuste o refuerzo de bisagras"),
  "a un disco no se le ofrecen bisagras"
);
assert(
  !getMantenimientosPorPerfil("monitor").includes("Cambio de pasta térmica"),
  "a un monitor no se le ofrece pasta térmica"
);
assert(
  getMantenimientosPorPerfil("laptop").includes("Ajuste o refuerzo de bisagras"),
  "a una laptop sí se le ofrecen bisagras"
);
assert(
  getMantenimientosPorPerfil("laptop").includes("Cambio de pasta térmica"),
  "a una laptop sí se le ofrece pasta térmica"
);
assert(
  getMantenimientosPorPerfil("disco").includes("Borrado seguro de datos"),
  "a un disco sí se le ofrece el borrado seguro"
);

// ── La validación del servidor sigue exactamente a la lista ─────────────────
assert(
  !intervencionAplica("disco", "Mantenimiento", "Ajuste o refuerzo de bisagras"),
  "el servidor rechaza bisagras en un disco"
);
assert(
  intervencionAplica("laptop", "Mantenimiento", "Ajuste o refuerzo de bisagras"),
  "el servidor acepta bisagras en una laptop"
);
assert(
  !intervencionAplica("laptop", "Mejora", "Limpieza interna"),
  "un mantenimiento no pasa como mejora"
);
assert(
  intervencionAplica("laptop", "Mejora", "Ampliación de RAM"),
  "una mejora válida pasa"
);
assert(
  !intervencionAplica("laptop", "Mantenimiento", "Cualquier cosa escrita a mano"),
  "el texto libre no entra: el catálogo de Airtable no se ensucia"
);
assert(
  intervencionAplica("laptop", "Mantenimiento", "  Limpieza interna  "),
  "los espacios de sobra no invalidan una opción buena"
);

// ── Categoría → perfil, tal como llega desde Airtable ───────────────────────
for (const [categoria, esperado] of [
  ["SSD", "disco"], ["HDD", "disco"], ["Monitor", "monitor"],
  ["Laptop", "laptop"], ["RAM", "ram"], ["Mini PC", "desktop"],
] as [string, PerfilRevision][]) {
  assert(getPerfilRevision(categoria) === esperado, `"${categoria}" usa el perfil ${esperado}`);
}

// Las categorías creadas en 2026-09 tienen trabajos propios, no los genéricos.
igual2(getIntervencionesPorCategoria("Impresora").mantenimientos.includes("Limpieza de cabezales"),
  "a una impresora se le limpian los cabezales");
igual2(!getIntervencionesPorCategoria("Impresora").mantenimientos.includes("Cambio de pasta térmica"),
  "y no se le cambia la pasta térmica");
igual2(getIntervencionesPorCategoria("Cámara / Seguridad").mantenimientos.includes("Limpieza de lente"),
  "a una cámara se le limpia el lente");
igual2(getIntervencionesPorCategoria("Celular").mejoras.includes("Cambio de pantalla"),
  "a un celular se le cambia la pantalla");
igual2(getIntervencionesPorCategoria("Insumo").mantenimientos.length === 2,
  "un insumo se consume: solo le quedan las dos opciones comunes");
igual2(!intervencionAplica("insumo", "Mantenimiento", "Limpieza de cabezales"),
  "el servidor rechaza un trabajo de impresora en un insumo");

const ssd = getIntervencionesPorCategoria("SSD");
assert(ssd.perfil === "disco", "getIntervencionesPorCategoria resuelve el perfil");
assert(
  !ssd.mantenimientos.includes("Cambio de pasta térmica"),
  "un SSD no recibe pasta térmica por la vía de la categoría"
);

// Una categoría desconocida no puede dejar la pantalla sin opciones.
const raro = getIntervencionesPorCategoria("Cafetera espacial");
assert(raro.perfil === "generico", "una categoría desconocida cae en genérico");
assert(raro.mantenimientos.length > 0, "genérico igual ofrece trabajos");

// ── Todo lo que puede llegar a escribirse en Airtable ───────────────────────
const detalles = todosLosDetalles();
assert(detalles.length > 0, "el catálogo completo no está vacío");
assert(new Set(detalles).size === detalles.length, "el catálogo completo no tiene repetidos");
assert(
  detalles.every((d) => d === d.trim() && d.length > 0),
  "ninguna opción tiene espacios de sobra"
);

console.log(fallos ? `\n${fallos} fallo(s)` : "\nTodo en orden");
process.exit(fallos ? 1 : 0);

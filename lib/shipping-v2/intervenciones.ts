// Catálogo de mantenimientos y mejoras por tipo de item.
//
// Por qué existe este módulo:
//
//   UNA LISTA ÚNICA PARA TODO LE PIDE AL TÉCNICO QUE ELIJA COSAS IMPOSIBLES.
//
// A un SSD NVMe no se le ajustan las bisagras, y a un monitor no se le cambia
// la pasta térmica. Cuando el selector ofrece opciones que no aplican, lo que
// se registra deja de ser confiable: un clic equivocado queda para siempre en
// el historial del item.
//
// Aquí cada perfil (el mismo agrupamiento de categorías que usa
// `revision-tecnica.ts`) tiene su propia lista. La lista es CERRADA y vive en
// el código, no en Airtable: el servidor valida contra ella antes de escribir,
// así que por la API no puede entrar un trabajo que no exista.
//
// Módulo puro: sin red, sin React, sin Airtable.

import type { PerfilRevision } from "./revision-tecnica";
import { getPerfilRevision } from "./revision-tecnica";

export type TipoIntervencion = "Mantenimiento" | "Mejora";

/** Lo que se le ofrece a cualquier item, sin importar qué sea. */
const MANT_COMUN = ["Limpieza general / externa", "Otro"];
const MEJORA_COMUN = ["Otro"];

// Los textos que ya existen como opción en Airtable se repiten LETRA POR LETRA.
// Cambiar una tilde crearía una opción nueva y partiría el historial en dos.
const MANTENIMIENTOS: Record<PerfilRevision, string[]> = {
  laptop: [
    "Limpieza interna",
    "Cambio de pasta térmica",
    "Limpieza de ventilador y disipador",
    "Ajuste o refuerzo de bisagras",
    "Limpieza de teclado",
    "Cambio de almohadillas",
    "Reemplazo de tornillos o tapas",
    "Actualización de BIOS / firmware",
    "Reinstalación del sistema operativo",
    "Recalibración de batería",
    ...MANT_COMUN,
  ],
  desktop: [
    "Limpieza interna",
    "Cambio de pasta térmica",
    "Limpieza de ventiladores y filtros",
    "Reordenado de cables",
    "Cambio de pila CMOS",
    "Reemplazo de tornillos o tapas",
    "Actualización de BIOS / firmware",
    "Reinstalación del sistema operativo",
    ...MANT_COMUN,
  ],
  allinone: [
    "Limpieza interna",
    "Cambio de pasta térmica",
    "Limpieza de ventiladores y filtros",
    "Limpieza de pantalla",
    "Reemplazo de tornillos o tapas",
    "Actualización de BIOS / firmware",
    "Reinstalación del sistema operativo",
    ...MANT_COMUN,
  ],
  monitor: [
    "Limpieza de pantalla",
    "Ajuste o refuerzo de la base o soporte",
    "Limpieza de puertos",
    "Reemplazo de tornillos o tapas",
    ...MANT_COMUN,
  ],
  tablet: [
    "Limpieza de pantalla",
    "Limpieza de puertos",
    "Recalibración de batería",
    "Restauración de fábrica",
    "Reemplazo de tornillos o tapas",
    ...MANT_COMUN,
  ],
  consola: [
    "Limpieza interna",
    "Cambio de pasta térmica",
    "Limpieza de ventilador y disipador",
    "Limpieza del lector óptico",
    "Actualización de BIOS / firmware",
    "Restauración de fábrica",
    ...MANT_COMUN,
  ],
  ram: ["Limpieza de contactos", ...MANT_COMUN],
  disco: [
    "Borrado seguro de datos",
    "Formateo",
    "Limpieza de contactos",
    "Actualización de BIOS / firmware",
    ...MANT_COMUN,
  ],
  grafica: [
    "Limpieza interna",
    "Cambio de pasta térmica",
    "Cambio de almohadillas",
    "Limpieza de ventilador y disipador",
    "Limpieza de contactos",
    "Actualización de BIOS / firmware",
    ...MANT_COMUN,
  ],
  mainboard: [
    "Limpieza interna",
    "Cambio de pasta térmica",
    "Cambio de almohadillas",
    "Limpieza de contactos",
    "Cambio de pila CMOS",
    "Actualización de BIOS / firmware",
    ...MANT_COMUN,
  ],
  fuente: ["Limpieza interna", "Limpieza de ventilador y disipador", "Reordenado de cables", ...MANT_COMUN],
  bateria: ["Recalibración de batería", "Limpieza de contactos", ...MANT_COMUN],
  cargador: ["Limpieza de contactos", "Reparación o refuerzo del cable", ...MANT_COMUN],
  "pantalla-repuesto": ["Limpieza de pantalla", "Limpieza del conector o flex", ...MANT_COMUN],
  "teclado-repuesto": ["Limpieza de teclado", "Reemplazo de teclas", "Limpieza del conector o flex", ...MANT_COMUN],
  celular: [
    "Limpieza de puertos",
    "Restauración de fábrica",
    "Recalibración de batería",
    ...MANT_COMUN,
  ],
  "disco-externo": [
    "Borrado seguro de datos",
    "Formateo",
    "Limpieza de contactos",
    "Reparación o refuerzo del cable",
    ...MANT_COMUN,
  ],
  smarthome: [
    "Restauración de fábrica",
    "Actualización de BIOS / firmware",
    "Limpieza de contactos",
    ...MANT_COMUN,
  ],
  audio: [
    "Limpieza de contactos",
    "Reparación o refuerzo del cable",
    "Cambio de almohadillas",
    ...MANT_COMUN,
  ],
  impresora: [
    "Limpieza interna",
    "Limpieza de cabezales",
    "Limpieza de rodillos",
    "Actualización de BIOS / firmware",
    ...MANT_COMUN,
  ],
  red: [
    "Restauración de fábrica",
    "Actualización de BIOS / firmware",
    ...MANT_COMUN,
  ],
  camara: [
    "Limpieza de lente",
    "Restauración de fábrica",
    "Actualización de BIOS / firmware",
    ...MANT_COMUN,
  ],
  energia: [
    "Limpieza interna",
    "Reparación o refuerzo del cable",
    ...MANT_COMUN,
  ],
  adaptador: [
    "Limpieza de contactos",
    "Reparación o refuerzo del cable",
    ...MANT_COMUN,
  ],
  // Un insumo se consume, no se le hace mantenimiento.
  insumo: [...MANT_COMUN],
  generico: [
    "Prueba de funcionamiento",
    "Limpieza de contactos",
    "Reparación o refuerzo del cable",
    ...MANT_COMUN,
  ],
};

const MEJORAS: Record<PerfilRevision, string[]> = {
  laptop: [
    "Ampliación de RAM",
    "Cambio de RAM",
    "Cambio de almacenamiento",
    "Ampliación de almacenamiento (2ª unidad)",
    "Cambio de batería",
    "Cambio de pantalla",
    "Cambio de teclado",
    "Cambio de bisagras",
    "Cambio de carcasa o tapa",
    "Cambio de cargador",
    ...MEJORA_COMUN,
  ],
  desktop: [
    "Ampliación de RAM",
    "Cambio de RAM",
    "Cambio de almacenamiento",
    "Ampliación de almacenamiento (2ª unidad)",
    "Cambio de tarjeta gráfica",
    "Cambio de fuente de poder",
    "Cambio de disipador o ventilador",
    "Cambio de procesador",
    "Cambio de mainboard",
    "Cambio de gabinete",
    ...MEJORA_COMUN,
  ],
  allinone: [
    "Ampliación de RAM",
    "Cambio de RAM",
    "Cambio de almacenamiento",
    "Ampliación de almacenamiento (2ª unidad)",
    "Cambio de pantalla",
    "Cambio de fuente de poder",
    ...MEJORA_COMUN,
  ],
  monitor: ["Cambio de base o soporte", "Cambio de fuente o adaptador", "Cambio de cable de poder", ...MEJORA_COMUN],
  tablet: ["Cambio de batería", "Cambio de pantalla", "Cambio de cargador", ...MEJORA_COMUN],
  consola: ["Cambio de almacenamiento", "Cambio de disipador o ventilador", "Cambio de control o mando", ...MEJORA_COMUN],
  ram: [...MEJORA_COMUN],
  disco: ["Cambio de carcasa o adaptador", ...MEJORA_COMUN],
  grafica: ["Cambio de disipador o ventilador", ...MEJORA_COMUN],
  mainboard: ["Cambio de procesador", ...MEJORA_COMUN],
  fuente: ["Cambio de cables modulares", ...MEJORA_COMUN],
  bateria: [...MEJORA_COMUN],
  cargador: ["Cambio de cable de poder", "Cambio de punta o conector", ...MEJORA_COMUN],
  "pantalla-repuesto": [...MEJORA_COMUN],
  "teclado-repuesto": [...MEJORA_COMUN],
  celular: ["Cambio de batería", "Cambio de pantalla", "Cambio de cargador", ...MEJORA_COMUN],
  "disco-externo": ["Cambio de carcasa o adaptador", "Cambio de cable de poder", ...MEJORA_COMUN],
  smarthome: ["Cambio de fuente o adaptador", ...MEJORA_COMUN],
  audio: ["Cambio de cable de poder", "Cambio de almohadillas", "Cambio de fuente o adaptador", ...MEJORA_COMUN],
  impresora: ["Cambio de cartucho o tóner", "Cambio de rodillos", "Cambio de cable de poder", ...MEJORA_COMUN],
  red: ["Cambio de fuente o adaptador", "Cambio de antenas", ...MEJORA_COMUN],
  camara: ["Cambio de fuente o adaptador", "Cambio de base o soporte", ...MEJORA_COMUN],
  energia: ["Cambio de batería", "Cambio de cable de poder", ...MEJORA_COMUN],
  adaptador: ["Cambio de cable de poder", ...MEJORA_COMUN],
  insumo: [...MEJORA_COMUN],
  generico: ["Cambio de accesorio incluido", ...MEJORA_COMUN],
};

/** Trabajos de conservación que aplican a este perfil. Nunca vacío. */
export function getMantenimientosPorPerfil(perfil: PerfilRevision): string[] {
  return [...(MANTENIMIENTOS[perfil] ?? MANTENIMIENTOS.generico)];
}

/** Mejoras que aplican a este perfil. Nunca vacío: siempre queda "Otro". */
export function getMejorasPorPerfil(perfil: PerfilRevision): string[] {
  return [...(MEJORAS[perfil] ?? MEJORAS.generico)];
}

/** Atajo para las pantallas, que conocen la categoría y no el perfil. */
export function getIntervencionesPorCategoria(categoria?: string | null): {
  perfil: PerfilRevision;
  mantenimientos: string[];
  mejoras: string[];
} {
  const perfil = getPerfilRevision(categoria);
  return {
    perfil,
    mantenimientos: getMantenimientosPorPerfil(perfil),
    mejoras: getMejorasPorPerfil(perfil),
  };
}

/**
 * ¿Este trabajo aplica a este item?
 *
 * Lo llama el SERVIDOR antes de escribir. El selector del navegador ya ofrece
 * solo lo válido, pero el endpoint acepta cualquier JSON de quien tenga
 * sesión: sin esta comprobación se podría guardar "Ajuste o refuerzo de
 * bisagras" en un disco, o texto libre que ensucie el catálogo de Airtable.
 */
export function intervencionAplica(
  perfil: PerfilRevision,
  tipo: TipoIntervencion,
  detalle: string
): boolean {
  const lista = tipo === "Mejora" ? getMejorasPorPerfil(perfil) : getMantenimientosPorPerfil(perfil);
  return lista.includes((detalle || "").trim());
}

/**
 * Todos los textos que el sistema puede llegar a escribir en `Detalle`.
 *
 * Sirve para revisar de un vistazo qué opciones existen y para las pruebas.
 */
export function todosLosDetalles(): string[] {
  const set = new Set<string>();
  for (const lista of Object.values(MANTENIMIENTOS)) lista.forEach((t) => set.add(t));
  for (const lista of Object.values(MEJORAS)) lista.forEach((t) => set.add(t));
  return [...set].sort((a, b) => a.localeCompare(b, "es"));
}

// Cómo se guarda una inspección técnica.
//
// Todo el resultado vive en UN campo de texto de `Shipping Items`
// (`Revisión técnica detalle`), en JSON. No se creó una tabla por punto a
// propósito: 30 puntos × 400 artículos al año son 12.000 filas para algo que
// nadie va a consultar de a una. Lo que sí se necesita filtrar —cuántos puntos
// fallaron— vive aparte en su propio campo numérico.
//
// Dos reglas que se respetan en todo el módulo:
//
// 1. NUNCA LANZA AL LEER. El campo puede traer basura: alguien lo editó a mano
//    en Airtable, o quedó a medias de una versión vieja. Una inspección que no
//    se puede abrir es peor que una vacía, así que lo ilegible se descarta y se
//    empieza de cero en vez de romper la pantalla.
//
// 2. EL SNAPSHOT SE EXPLICA SOLO. Cada resultado guarda el TEXTO del punto,
//    no solo su id. Los puntos de revisión van a cambiar de redacción con el
//    uso, y un id que ya no existe dejaría el registro mudo. Con el texto
//    dentro, la inspección de hace seis meses se sigue leyendo aunque el punto
//    se llame distinto hoy.

import type { GrupoDeclarable, ResultadoPunto, ZonaRevision } from "./revision-tecnica";

export const VERSION_SNAPSHOT = 1;

export type ResultadoGuardado = {
  /** Resultado del punto. */
  r: ResultadoPunto;
  /** Texto del punto tal como estaba cuando se marcó. Ver regla 2. */
  txt: string;
  /** Quién lo marcó. */
  por: string;
  /** Cuándo, en ISO. */
  en: string;
};

export type OpcionGuardada = { nombre: string; grupo: GrupoDeclarable };

export type SnapshotRevision = {
  version: number;
  categoria: string;
  equipamiento: {
    opciones: OpcionGuardada[];
    confirmadoPor: string;
    confirmadoEn: string;
  };
  /** puntoId → resultado */
  puntos: Record<string, ResultadoGuardado>;
  /** zonaId → observación libre */
  observaciones: Record<string, string>;
  actualizadoPor: string;
  actualizadoEn: string;
};

const GRUPOS: ReadonlySet<string> = new Set(["conectividad", "puerto", "extra"]);
const RESULTADOS: ReadonlySet<string> = new Set(["ok", "falla", "na"]);

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

export function crearSnapshotVacio(categoria?: string | null): SnapshotRevision {
  return {
    version: VERSION_SNAPSHOT,
    categoria: texto(categoria),
    equipamiento: { opciones: [], confirmadoPor: "", confirmadoEn: "" },
    puntos: {},
    observaciones: {},
    actualizadoPor: "",
    actualizadoEn: "",
  };
}

/**
 * Lee el campo de Airtable. Tolerante por diseño: cualquier cosa que no se
 * entienda se descarta en silencio y se conserva lo demás. Un punto corrupto
 * no puede llevarse por delante los otros 29.
 */
export function parsearSnapshot(bruto: unknown, categoria?: string | null): SnapshotRevision {
  const vacio = crearSnapshotVacio(categoria);
  const crudo = texto(bruto);
  if (!crudo) return vacio;

  let datos: unknown;
  try {
    datos = JSON.parse(crudo);
  } catch {
    // Alguien escribió texto plano en el campo. Se empieza de cero.
    return vacio;
  }
  if (!datos || typeof datos !== "object" || Array.isArray(datos)) return vacio;

  const obj = datos as Record<string, unknown>;
  const snapshot = crearSnapshotVacio(texto(obj.categoria) || categoria);

  // ── Equipamiento ──
  const eq = (obj.equipamiento && typeof obj.equipamiento === "object" ? obj.equipamiento : {}) as Record<string, unknown>;
  if (Array.isArray(eq.opciones)) {
    for (const item of eq.opciones) {
      if (!item || typeof item !== "object") continue;
      const opcion = item as Record<string, unknown>;
      const nombre = texto(opcion.nombre);
      const grupo = texto(opcion.grupo);
      if (!nombre || !GRUPOS.has(grupo)) continue;
      snapshot.equipamiento.opciones.push({ nombre, grupo: grupo as GrupoDeclarable });
    }
  }
  snapshot.equipamiento.confirmadoPor = texto(eq.confirmadoPor);
  snapshot.equipamiento.confirmadoEn = texto(eq.confirmadoEn);

  // ── Puntos ──
  if (obj.puntos && typeof obj.puntos === "object" && !Array.isArray(obj.puntos)) {
    for (const [id, valor] of Object.entries(obj.puntos as Record<string, unknown>)) {
      if (!id || !valor || typeof valor !== "object") continue;
      const guardado = valor as Record<string, unknown>;
      const r = texto(guardado.r);
      if (!RESULTADOS.has(r)) continue;
      snapshot.puntos[id] = {
        r: r as ResultadoPunto,
        txt: texto(guardado.txt),
        por: texto(guardado.por),
        en: texto(guardado.en),
      };
    }
  }

  // ── Observaciones ──
  if (obj.observaciones && typeof obj.observaciones === "object" && !Array.isArray(obj.observaciones)) {
    for (const [zona, valor] of Object.entries(obj.observaciones as Record<string, unknown>)) {
      const nota = texto(valor);
      if (zona && nota) snapshot.observaciones[zona] = nota;
    }
  }

  snapshot.actualizadoPor = texto(obj.actualizadoPor);
  snapshot.actualizadoEn = texto(obj.actualizadoEn);
  return snapshot;
}

export function serializarSnapshot(snapshot: SnapshotRevision): string {
  return JSON.stringify(snapshot);
}

/** Los resultados en la forma que esperan las funciones de `revision-tecnica`. */
export function resultadosDe(snapshot: SnapshotRevision): Record<string, ResultadoPunto> {
  const salida: Record<string, ResultadoPunto> = {};
  for (const [id, guardado] of Object.entries(snapshot.puntos)) salida[id] = guardado.r;
  return salida;
}

export function equipamientoConfirmado(snapshot: SnapshotRevision): boolean {
  return Boolean(snapshot.equipamiento.confirmadoPor && snapshot.equipamiento.confirmadoEn);
}

// ─── Mutaciones ─────────────────────────────────────────────────────────────
//
// Devuelven un snapshot NUEVO en lugar de modificar el que reciben, para que
// quien llama pueda comparar antes/después y decidir si hace falta escribir.

function sellar(snapshot: SnapshotRevision, actor: string, ahora: string): SnapshotRevision {
  return { ...snapshot, actualizadoPor: actor, actualizadoEn: ahora };
}

export function marcarPunto(
  snapshot: SnapshotRevision,
  input: { puntoId: string; texto: string; resultado: ResultadoPunto | null; actor: string; ahora?: string }
): SnapshotRevision {
  const ahora = input.ahora ?? new Date().toISOString();
  const puntos = { ...snapshot.puntos };

  if (input.resultado === null) {
    delete puntos[input.puntoId];
  } else {
    puntos[input.puntoId] = {
      r: input.resultado,
      txt: input.texto,
      por: input.actor,
      en: ahora,
    };
  }
  return sellar({ ...snapshot, puntos }, input.actor, ahora);
}

export function guardarObservacion(
  snapshot: SnapshotRevision,
  input: { zonaId: string; nota: string; actor: string; ahora?: string }
): SnapshotRevision {
  const ahora = input.ahora ?? new Date().toISOString();
  const observaciones = { ...snapshot.observaciones };
  const nota = input.nota.trim();
  if (nota) observaciones[input.zonaId] = nota;
  else delete observaciones[input.zonaId];
  return sellar({ ...snapshot, observaciones }, input.actor, ahora);
}

/**
 * Firma qué trae el equipo.
 *
 * Si lo declarado CAMBIÓ respecto de lo que estaba firmado, la firma anterior
 * ya no vale: se está firmando otra cosa. Por eso siempre se re-firma con el
 * actor actual, y no se conserva la firma vieja.
 */
export function confirmarEquipamiento(
  snapshot: SnapshotRevision,
  input: { opciones: readonly OpcionGuardada[]; actor: string; ahora?: string }
): SnapshotRevision {
  const ahora = input.ahora ?? new Date().toISOString();
  return sellar({
    ...snapshot,
    equipamiento: {
      opciones: input.opciones.map((o) => ({ nombre: o.nombre.trim(), grupo: o.grupo })),
      confirmadoPor: input.actor,
      confirmadoEn: ahora,
    },
  }, input.actor, ahora);
}

/**
 * Cambia lo declarado SIN firmarlo. Tumba la confirmación anterior a
 * propósito: lo que estaba firmado ya no es lo que dice el equipo ahora.
 */
export function actualizarEquipamiento(
  snapshot: SnapshotRevision,
  input: { opciones: readonly OpcionGuardada[]; actor: string; ahora?: string }
): SnapshotRevision {
  const ahora = input.ahora ?? new Date().toISOString();
  return sellar({
    ...snapshot,
    equipamiento: {
      opciones: input.opciones.map((o) => ({ nombre: o.nombre.trim(), grupo: o.grupo })),
      confirmadoPor: "",
      confirmadoEn: "",
    },
  }, input.actor, ahora);
}

// ─── Limpieza y derivados ───────────────────────────────────────────────────

/**
 * Descarta resultados de puntos que ya no existen.
 *
 * Pasa cuando el técnico desmarca una característica: el punto que generaba
 * desaparece, y su resultado quedaría colgado inflando el conteo de fallas.
 * También pasa si cambiamos los puntos de una categoría en el código.
 */
export function limpiarHuerfanos(
  snapshot: SnapshotRevision,
  zonas: readonly ZonaRevision[]
): { snapshot: SnapshotRevision; descartados: number } {
  const vigentes = new Set(zonas.flatMap((z) => z.puntos.map((p) => p.id)));
  const zonasVigentes = new Set(zonas.map((z) => z.id));

  const puntos: Record<string, ResultadoGuardado> = {};
  let descartados = 0;
  for (const [id, guardado] of Object.entries(snapshot.puntos)) {
    if (vigentes.has(id)) puntos[id] = guardado;
    else descartados += 1;
  }

  const observaciones: Record<string, string> = {};
  for (const [zonaId, nota] of Object.entries(snapshot.observaciones)) {
    if (zonasVigentes.has(zonaId)) observaciones[zonaId] = nota;
  }

  if (!descartados && Object.keys(observaciones).length === Object.keys(snapshot.observaciones).length) {
    return { snapshot, descartados: 0 };
  }
  return { snapshot: { ...snapshot, puntos, observaciones }, descartados };
}

/** Lo que va al campo numérico de Airtable, para poder filtrar sin leer el JSON. */
export function contarFallas(snapshot: SnapshotRevision, zonas?: readonly ZonaRevision[]): number {
  if (!zonas) {
    return Object.values(snapshot.puntos).filter((p) => p.r === "falla").length;
  }
  const vigentes = new Set(zonas.flatMap((z) => z.puntos.map((p) => p.id)));
  return Object.entries(snapshot.puntos).filter(([id, p]) => p.r === "falla" && vigentes.has(id)).length;
}

/** Los puntos críticos que fallaron: cada uno debe tener su novedad abierta. */
export function fallasCriticas(
  snapshot: SnapshotRevision,
  zonas: readonly ZonaRevision[]
): { zonaId: string; zona: string; puntoId: string; punto: string }[] {
  const salida: { zonaId: string; zona: string; puntoId: string; punto: string }[] = [];
  for (const zona of zonas) {
    for (const punto of zona.puntos) {
      if (punto.critico && snapshot.puntos[punto.id]?.r === "falla") {
        salida.push({ zonaId: zona.id, zona: zona.nombre, puntoId: punto.id, punto: punto.texto });
      }
    }
  }
  return salida;
}

/**
 * ¿La firma del equipamiento sigue valiendo?
 *
 * Lo que el equipo trae vive en los campos de la ficha (`Conectividad V2`,
 * `Puertos V2`, `Características extras V2`), no aquí. El snapshot guarda una
 * COPIA de lo que había cuando se firmó, justamente para detectar esto: si
 * alguien editó la ficha después, la firma quedó sobre otra cosa y hay que
 * volver a confirmar. Sin esta comparación, un compañero podría agregar una
 * característica y la inspección se cerraría sin que nadie probara su punto.
 */
export function firmaVigente(
  snapshot: SnapshotRevision,
  declaradasAhora: readonly OpcionGuardada[]
): boolean {
  if (!equipamientoConfirmado(snapshot)) return false;

  const clave = (opciones: readonly OpcionGuardada[]) =>
    opciones
      .map((o) => `${o.grupo}:${o.nombre.trim().toLowerCase()}`)
      .sort()
      .join("|");

  return clave(snapshot.equipamiento.opciones) === clave(declaradasAhora);
}

/**
 * ¿En qué punto está la inspección de este item, sin abrir la pantalla?
 *
 * Lo usa la lista de Recepción para pintar el botón: verde cuando está
 * firmada, ámbar cuando alguien empezó y la dejó a medias, apagado cuando
 * nadie la tocó. Sin esto, una inspección abandonada se ve igual que una que
 * nunca empezó, y nadie se entera de que quedó colgada.
 *
 * Es deliberadamente barato: no arma zonas ni cuenta puntos, solo mira si hay
 * algo guardado. La lista puede tener cientos de filas.
 */
export function avanceDeInspeccion(
  bruto: unknown,
  firmada: boolean
): "firmada" | "en-proceso" | "sin-empezar" {
  if (firmada) return "firmada";
  const snapshot = parsearSnapshot(bruto);
  const hayMarcas = Object.keys(snapshot.puntos).length > 0;
  const hayEquipamiento = Boolean(snapshot.equipamiento.confirmadoPor);
  const hayNotas = Object.keys(snapshot.observaciones).length > 0;
  return hayMarcas || hayEquipamiento || hayNotas ? "en-proceso" : "sin-empezar";
}

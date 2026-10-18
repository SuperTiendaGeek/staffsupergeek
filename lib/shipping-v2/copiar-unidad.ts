// Copiar entre unidades del mismo producto (punto 10b-4b, decisiones del
// dueño del 17-oct-2026). Solo reglas, sin red.
//
// - FICHA: "¿Usar estos datos técnicos en otras unidades?". Se copian los
//   datos del PRODUCTO (marca y modelo de ficha, sistema, pantalla, CPU, RAM,
//   discos, GPU, conectividad, puertos, extras y los datos de su categoría).
//   Lo propio de la unidad NUNCA se copia: batería (salud y estado), la
//   observación de la ficha, el color, el detalle, el precio y la marca de
//   "revisada".
// - INSPECCIÓN: "⋯ Copiar de otra unidad" (opción secundaria, para unidades
//   nuevas selladas idénticas). Se copian los puntos "Conforme" y "No aplica"
//   y el equipamiento declarado; las fallas y las observaciones no, y el
//   técnico igual revisa y firma.

import { SHIPPING_V2_ITEM_FIELDS as F } from "./schema.generated";
import { parsearEspecificaciones, serializarEspecificaciones } from "./especificaciones";
import { normalizarTexto } from "./importar-lineas";
import type { SnapshotRevision } from "./revision-tecnica-snapshot";
import type { ResultadoPunto } from "./revision-tecnica";

/** Campos de la ficha que describen al producto (iguales en todas sus unidades). */
export const CAMPOS_FICHA_DEL_PRODUCTO: readonly string[] = [
  F.marcaFicha,
  F.modeloFicha,
  F.sistemaOperativo,
  F.pantallaTamano,
  F.pantallaResolucion,
  F.cpuMarca,
  F.cpuModelo,
  F.cpuFrecuenciaBase,
  F.cpuFrecuenciaTurbo,
  F.ramCapacidad,
  F.ramTipo,
  F.almacenamientoPrincipal,
  F.almacenamientoTipo,
  "Almacenamiento 2",
  "Almacenamiento 2 tipo",
  F.gpu,
  F.gpuIntegrada,
];

/** Vínculos a los catálogos (listas de ids). */
export const VINCULOS_FICHA_DEL_PRODUCTO: readonly string[] = [F.conectividadV2, F.puertosV2, F.caracteristicasExtrasV2];

/** Datos de categoría que son de cada unidad (la salud de batería de un celular o de una batería). */
export const ESPEC_DE_LA_UNIDAD: ReadonlySet<string> = new Set(["salud"]);

export const CAMPO_ESPECIFICACIONES = "Especificaciones técnicas";

/** Lo que ya salió del inventario no recibe datos copiados. */
const ESTADOS_SIN_COPIA = new Set(["vendido", "agotado", "dado de baja", "cancelado", "devuelto a proveedor"]);

function sku(valor?: string | null) {
  return String(valor ?? "").trim().toUpperCase();
}

/** ¿Se pueden copiar los datos del producto de `origen` a `destino`? null = sí; si no, el motivo. */
export function evaluarCopiaFicha(
  origen: { id: string; sku?: string | null },
  destino: { id: string; sku?: string | null; estado?: string | null }
): string | null {
  if (origen.id === destino.id) return "Es la misma unidad.";
  if (!sku(origen.sku) || sku(origen.sku) !== sku(destino.sku)) return "No es del mismo producto (otro SKU).";
  if (ESTADOS_SIN_COPIA.has(normalizarTexto(destino.estado))) return `Ya no está en inventario (${destino.estado}).`;
  return null;
}

/**
 * Los campos a escribir en la unidad destino: los del producto exactamente como
 * están en el origen (vacío en el origen = vacío en el destino), los datos de
 * categoría del origen conservando la salud de batería del destino, y la ficha
 * "generada" si el origen la tiene. "Revisada" no se copia.
 */
export function camposFichaCopiada(
  origen: Record<string, unknown>,
  destino: { especificaciones?: unknown; fichaGenerada?: boolean | null },
  firma: { actor: string; ahora: string }
): Record<string, unknown> {
  const campos: Record<string, unknown> = {};
  for (const campo of CAMPOS_FICHA_DEL_PRODUCTO) {
    const valor = origen[campo];
    campos[campo] = valor === undefined || valor === "" ? null : valor;
  }
  for (const campo of VINCULOS_FICHA_DEL_PRODUCTO) {
    const valor = origen[campo];
    campos[campo] = Array.isArray(valor) ? valor.filter((v) => typeof v === "string") : [];
  }

  const delOrigen = parsearEspecificaciones(origen[CAMPO_ESPECIFICACIONES]).valores;
  const delDestino = parsearEspecificaciones(destino.especificaciones).valores;
  const valores: Record<string, string> = {};
  for (const [id, valor] of Object.entries(delOrigen)) if (!ESPEC_DE_LA_UNIDAD.has(id)) valores[id] = valor;
  for (const [id, valor] of Object.entries(delDestino)) if (ESPEC_DE_LA_UNIDAD.has(id)) valores[id] = valor;
  if (Object.keys(valores).length || Object.keys(delDestino).length) {
    campos[CAMPO_ESPECIFICACIONES] = serializarEspecificaciones({ version: 1, valores, actualizadoPor: firma.actor, actualizadoEn: firma.ahora });
  }

  if (origen[F.fichaTecnicaGenerada] === true && destino.fichaGenerada !== true) {
    campos[F.fichaTecnicaGenerada] = true;
    campos[F.fichaTecnicaGeneradaPor] = firma.actor;
    campos[F.fechaFichaTecnicaGenerada] = firma.ahora;
  }
  campos[F.ultimaActualizacion] = firma.ahora;
  campos[F.actualizadoPor] = firma.actor;
  return campos;
}

/** Los puntos de la inspección que se pueden copiar: solo "Conforme" y "No aplica". */
export function resultadosParaCopiar(snapshot: Pick<SnapshotRevision, "puntos">): Array<{ puntoId: string; resultado: ResultadoPunto }> {
  return Object.entries(snapshot.puntos)
    .filter(([, guardado]) => guardado.r === "ok" || guardado.r === "na")
    .map(([puntoId, guardado]) => ({ puntoId, resultado: guardado.r }));
}

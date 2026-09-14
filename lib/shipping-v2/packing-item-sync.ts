// Qué artículos puede tocar una transición de estado de packing.
//
// ─── Por qué existe este archivo ─────────────────────────────────────────────
//
// Las transiciones de packing (marcar en tránsito, marcar recibido, iniciar
// revisión) escribían el MISMO Estado Item sobre TODOS los artículos
// vinculados, sin mirar en qué estado estaba cada uno. Eso no es avanzar un
// flujo: es pisarlo.
//
// Caso real, PK-20260610-47604 el 2026-09-14: el packing llevaba meses
// recibido y sus 10 artículos ya estaban revisados — 9 "Disponible" a la venta
// y 1 "Vendido" — todos con Estado de revisión "Recibido correctamente".
// Pulsar "Iniciar revisión" los devolvió a los 10 a "En revisión" y borró el
// veredicto, dejándolos en "Recibido pendiente de revisión". Un artículo YA
// VENDIDO volvió a aparecer como pendiente de revisar.
//
// La regla correcta: una transición de packing solo AVANZA artículos que
// siguen en una etapa anterior. Nunca retrocede a uno que ya pasó por
// recepción, ya está a la venta, ya se vendió o ya se consumió.

/**
 * Posición de cada Estado Item dentro del recorrido logístico.
 *
 * Solo importa el ORDEN relativo, no el número. Los estados que ya salieron
 * de recepción comparten el nivel más alto: desde ahí ninguna transición de
 * packing debe moverlos.
 */
const ITEM_FLOW_RANK: Record<string, number> = {
  // Antes de existir físicamente en la caja
  registrado: 0,
  "pendiente de pago": 0,
  pagado: 0,
  "pendiente de packing": 1,
  "en packing": 1,
  // En movimiento
  "en transito": 2,
  // Ya llegó a la tienda
  recibido: 3,
  // Se está revisando
  "en revision": 4,
  "con novedad": 4,
  "en garantia con proveedor": 4,
  // Ya salió de recepción: intocable por una transición de packing
  disponible: 5,
  reservado: 5,
  repuesto: 5,
  "uso local": 5,
  "destinado a partes": 5,
  "desarmado parcialmente": 5,
  "desarmado completamente": 5,
  vendido: 6,
  "usado en reparacion": 6,
  migrado: 6,
  cancelado: 6,
  archivado: 6,
};

function normalize(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Nivel del estado. Un estado desconocido devuelve null: ante la duda NO se
 * toca el artículo, porque pisar un dato bueno cuesta mucho más que dejar un
 * artículo sin avanzar (que el usuario puede corregir a mano).
 */
export function getShippingV2ItemFlowRank(estado?: string | null): number | null {
  const rank = ITEM_FLOW_RANK[normalize(estado)];
  return rank === undefined ? null : rank;
}

export type ShippingV2PackingSyncItemLike = {
  id?: string;
  sku?: string;
  estado?: string | null;
};

export type ShippingV2PackingSyncDecision = {
  aplicar: boolean;
  motivo: string;
};

/**
 * ¿Debe esta transición de packing escribir sobre este artículo?
 *
 * Sí solo si el artículo está en una etapa ANTERIOR a la de destino. Igual o
 * posterior se deja intacto.
 */
export function decideShippingV2PackingItemSync(
  item: ShippingV2PackingSyncItemLike,
  estadoDestino: string
): ShippingV2PackingSyncDecision {
  const destino = getShippingV2ItemFlowRank(estadoDestino);
  if (destino === null) {
    return { aplicar: false, motivo: `Estado destino no reconocido: ${estadoDestino}.` };
  }

  const actual = getShippingV2ItemFlowRank(item.estado);
  if (actual === null) {
    const etiqueta = item.estado?.trim() || "sin estado";
    return { aplicar: false, motivo: `Estado actual no reconocido (${etiqueta}); se deja intacto.` };
  }
  if (actual < destino) {
    return { aplicar: true, motivo: "" };
  }
  if (actual === destino) {
    return { aplicar: false, motivo: `Ya estaba en ${item.estado}.` };
  }
  return { aplicar: false, motivo: `Ya avanzó más allá de esta etapa (${item.estado}); no se retrocede.` };
}

export type ShippingV2PackingSyncPlan<T extends ShippingV2PackingSyncItemLike> = {
  aplicar: T[];
  omitidos: Array<{ item: T; motivo: string }>;
  resumen: string;
};

/** Separa los artículos que sí avanzan de los que se dejan intactos. */
export function planShippingV2PackingItemSync<T extends ShippingV2PackingSyncItemLike>(
  items: T[],
  estadoDestino: string
): ShippingV2PackingSyncPlan<T> {
  const aplicar: T[] = [];
  const omitidos: Array<{ item: T; motivo: string }> = [];

  for (const item of items) {
    const decision = decideShippingV2PackingItemSync(item, estadoDestino);
    if (decision.aplicar) aplicar.push(item);
    else omitidos.push({ item, motivo: decision.motivo });
  }

  const resumen = omitidos.length
    ? `${aplicar.length} artículo(s) avanzaron a ${estadoDestino}; ${omitidos.length} se dejaron intactos por estar en una etapa igual o posterior.`
    : `${aplicar.length} artículo(s) avanzaron a ${estadoDestino}.`;

  return { aplicar, omitidos, resumen };
}

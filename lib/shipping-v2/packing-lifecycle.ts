// Ciclo de vida de un packing de Shipping V2: fases, etiquetas visibles y
// avance real de revisión. Aritmética y texto puros, sin red, para poder
// probarlo entero.
//
// ─── Por qué existe este archivo ─────────────────────────────────────────────
//
// El "Estado Packing" de Airtable es 100% manual: alguien tiene que pulsar
// "Iniciar revisión" o "Cerrar ciclo". Nada lo mantiene sincronizado con lo
// que de verdad pasó con los artículos de la caja. El resultado, medido sobre
// los 17 packings reales:
//
//   · Packings con los 10 artículos revisados y publicados seguían en
//     "Recibido" solo porque nadie pulsó el botón siguiente.
//   · Packings con 46 de 47 artículos sin revisar se veían EXACTAMENTE igual
//     que los ya terminados: ambos decían "En revisión".
//   · Ninguno de los 17 llegó nunca a "Cerrado final", el estado que sí
//     significa "ciclo terminado". La lista entera parecía trabajo pendiente.
//
// Este módulo no escribe nada ni cambia estados: calcula el avance real y
// traduce el estado a un lenguaje que un empleado entiende de un vistazo.
// La decisión de avanzar el estado sigue siendo del usuario.

import {
  calculateShippingV2ItemChecklist,
  SHIPPING_V2_CHECKLIST_STEPS,
  shippingV2ChecklistStepLabel,
  type ShippingV2ChecklistKey,
  type ShippingV2ReceptionChecklistItemLike,
} from "@/lib/shipping-v2/reception-checklist";

export type ShippingV2PackingFase =
  | "preparacion"
  | "en-camino"
  | "en-bodega"
  | "revision"
  | "cerrado"
  | "cancelado"
  | "desconocida";

export type ShippingV2PackingFaseInfo = {
  fase: ShippingV2PackingFase;
  /** Nombre de la fase para agrupar y filtrar. */
  faseLabel: string;
  /** Etiqueta visible del estado. Airtable conserva su propio valor. */
  estadoLabel: string;
  /** Una línea que explica qué significa el estado. */
  significado: string;
  /** true cuando el packing ya terminó su ciclo logístico y de revisión. */
  terminado: boolean;
};

function normalize(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Traducción estado de Airtable → lenguaje del portal.
 *
 * IMPORTANTE: esto es SOLO presentación. En Airtable el estado final se sigue
 * llamando "Cerrado final" y nada de este módulo lo renombra; cambiar el valor
 * del single select rompería los registros históricos y las automatizaciones.
 */
export function getShippingV2PackingFaseInfo(estado?: string | null): ShippingV2PackingFaseInfo {
  const state = normalize(estado);

  if (state === "en proceso") {
    return {
      fase: "preparacion",
      faseLabel: "Preparación",
      estadoLabel: "En proceso",
      significado: "Se está armando. Todavía se pueden agregar o quitar artículos.",
      terminado: false,
    };
  }
  if (state === "cerrado") {
    return {
      fase: "preparacion",
      faseLabel: "Preparación",
      estadoLabel: "Armado · listo para enviar",
      significado: "Ya no se agregan artículos. Falta confirmar que salió hacia Ecuador.",
      terminado: false,
    };
  }
  if (state === "en transito") {
    return {
      fase: "en-camino",
      faseLabel: "En camino",
      estadoLabel: "En tránsito",
      significado: "Salió hacia destino. No hay nada que hacer hasta que llegue.",
      terminado: false,
    };
  }
  if (state === "recibido") {
    return {
      fase: "en-bodega",
      faseLabel: "En bodega",
      estadoLabel: "Recibido · falta revisar",
      significado: "La caja llegó pero su contenido todavía no pasó por revisión.",
      terminado: false,
    };
  }
  if (state === "en revision") {
    return {
      fase: "revision",
      faseLabel: "Revisión",
      estadoLabel: "En revisión",
      significado: "Se está revisando y fotografiando el contenido.",
      terminado: false,
    };
  }
  if (state === "con novedad") {
    return {
      fase: "revision",
      faseLabel: "Revisión",
      estadoLabel: "Con novedad",
      significado: "Hay un problema abierto (faltante, daño o garantía) por resolver.",
      terminado: false,
    };
  }
  if (state === "cerrado final") {
    return {
      fase: "cerrado",
      faseLabel: "Ciclo cerrado",
      estadoLabel: "Ciclo cerrado",
      significado: "Logística y revisión terminadas. Lo único que queda es vender los artículos.",
      terminado: true,
    };
  }
  if (state === "cancelado") {
    return {
      fase: "cancelado",
      faseLabel: "Cancelado",
      estadoLabel: "Cancelado",
      significado: "Packing anulado. No cuenta como trabajo pendiente.",
      terminado: true,
    };
  }
  return {
    fase: "desconocida",
    faseLabel: "Sin clasificar",
    estadoLabel: estado?.trim() || "Sin estado",
    significado: "Estado no reconocido por el portal. Revísalo en Airtable.",
    terminado: false,
  };
}

/** Orden en que se muestran las fases: de lo más pendiente a lo ya cerrado. */
export const SHIPPING_V2_PACKING_FASES_ORDEN: ShippingV2PackingFase[] = [
  "preparacion",
  "en-camino",
  "en-bodega",
  "revision",
  "cerrado",
  "cancelado",
  "desconocida",
];

// ─── Avance real del ciclo ───────────────────────────────────────────────────
//
// El criterio de "artículo terminado" vive en reception-checklist.ts: las 7
// casillas acordadas (Recibido, Revisado, Fotos + las 4 publicaciones, estas
// últimas solo cuando aplican). Aquí solo se agrega por packing.
//
// Antes esto miraba solo dos señales de revisión, lo que daba packings al 100%
// que en realidad no tenían fotos ni publicaciones. Ahora el número que ve el
// usuario es el mismo que decide si el packing puede cerrar su ciclo.

export type ShippingV2PackingReviewProgress = {
  total: number;
  /** Artículos con las 7 casillas resueltas (hechas o no aplicables). */
  revisados: number;
  pendientes: number;
  porcentaje: number;
  completo: boolean;
  /** Cuántos artículos tienen pendiente cada paso, para decir qué falta. */
  pendientesPorPaso: Partial<Record<ShippingV2ChecklistKey, number>>;
  /** Artículos cuyos pasos de publicación no aplican (repuesto, uso local, ya vendido). */
  sinPublicacionAplicable: number;
  /** Artículos a los que todavía les falta algún paso de bodega. */
  pendientesDeBodega: number;
  /**
   * Artículos con los 3 pasos de bodega listos, publiquen o no.
   *
   * Se expone aparte del total porque son dos hitos distintos y el usuario
   * necesita verlos separados: "la caja ya está revisada y fotografiada" es
   * trabajo de bodega y suele terminar semanas antes que las publicaciones,
   * que son trabajo comercial. Sin este número, un packing con la bodega
   * cerrada al 100% se ve igual que uno recién llegado.
   */
  bodegaCompletos: number;
  bodegaCompleta: boolean;
};

export function calculateShippingV2PackingReviewProgress(
  items: ShippingV2ReceptionChecklistItemLike[]
): ShippingV2PackingReviewProgress {
  const total = items.length;
  const checklists = items.map((item) => calculateShippingV2ItemChecklist(item));
  const revisados = checklists.filter((checklist) => checklist.completo).length;

  const pendientesPorPaso: Partial<Record<ShippingV2ChecklistKey, number>> = {};
  for (const checklist of checklists) {
    for (const key of checklist.pendientes) {
      pendientesPorPaso[key] = (pendientesPorPaso[key] ?? 0) + 1;
    }
  }

  const pasosBodega = new Set<ShippingV2ChecklistKey>(
    SHIPPING_V2_CHECKLIST_STEPS.filter((paso) => paso.grupo === "bodega").map((paso) => paso.key)
  );

  return {
    total,
    revisados,
    pendientes: Math.max(0, total - revisados),
    porcentaje: total === 0 ? 0 : Math.round((revisados / total) * 100),
    completo: total > 0 && revisados === total,
    pendientesPorPaso,
    sinPublicacionAplicable: checklists.filter((checklist) => !checklist.publicacionAplica).length,
    pendientesDeBodega: checklists.filter((checklist) =>
      checklist.pendientes.some((key) => pasosBodega.has(key))
    ).length,
    bodegaCompletos: checklists.filter((checklist) =>
      !checklist.pendientes.some((key) => pasosBodega.has(key))
    ).length,
    bodegaCompleta: total > 0 && checklists.every((checklist) =>
      !checklist.pendientes.some((key) => pasosBodega.has(key))
    ),
  };
}

/** Resumen corto de los dos hitos: bodega y ciclo completo. */
export function formatShippingV2PackingBodegaProgress(progress: ShippingV2PackingReviewProgress): string {
  if (progress.total === 0) return "Sin artículos";
  return `${progress.bodegaCompletos}/${progress.total} con bodega lista`;
}

export function formatShippingV2PackingReviewProgress(progress: ShippingV2PackingReviewProgress): string {
  if (progress.total === 0) return "Sin artículos";
  return `${progress.revisados}/${progress.total} completos`;
}

/** El paso que más artículos tienen pendiente, para resumir "qué falta". */
export function getShippingV2PackingTopPendingStep(
  progress: ShippingV2PackingReviewProgress
): { key: ShippingV2ChecklistKey; label: string; cantidad: number } | null {
  let mejor: { key: ShippingV2ChecklistKey; cantidad: number } | null = null;
  for (const paso of SHIPPING_V2_CHECKLIST_STEPS) {
    const cantidad = progress.pendientesPorPaso[paso.key] ?? 0;
    if (cantidad > 0 && (!mejor || cantidad > mejor.cantidad)) mejor = { key: paso.key, cantidad };
  }
  if (!mejor) return null;
  return { ...mejor, label: shippingV2ChecklistStepLabel(mejor.key) };
}

// ─── Qué falta: una línea accionable por packing ─────────────────────────────

export type ShippingV2PackingWorkHint = {
  texto: string;
  /** "accion" = alguien tiene que hacer algo; "espera" = no depende de ti. */
  tono: "accion" | "espera" | "listo" | "alerta";
  /** true cuando solo falta pulsar el botón de cierre de ciclo. */
  listoParaCerrarCiclo: boolean;
};

export function getShippingV2PackingWorkHint(input: {
  estado?: string | null;
  progress: ShippingV2PackingReviewProgress;
  novedadesAbiertas?: number;
}): ShippingV2PackingWorkHint {
  const info = getShippingV2PackingFaseInfo(input.estado);
  const novedades = input.novedadesAbiertas ?? 0;
  const { progress } = input;

  if (info.fase === "cancelado") {
    return { texto: "Cancelado. Nada que hacer.", tono: "listo", listoParaCerrarCiclo: false };
  }
  if (info.fase === "cerrado") {
    return { texto: "Ciclo cerrado. Solo queda vender.", tono: "listo", listoParaCerrarCiclo: false };
  }
  if (info.fase === "preparacion") {
    return normalize(input.estado) === "en proceso"
      ? { texto: "Termina de armar el packing y ciérralo.", tono: "accion", listoParaCerrarCiclo: false }
      : { texto: "Confirma el envío para pasarlo a tránsito.", tono: "accion", listoParaCerrarCiclo: false };
  }
  if (info.fase === "en-camino") {
    return { texto: "En camino. Marca recibido cuando llegue.", tono: "espera", listoParaCerrarCiclo: false };
  }

  // En bodega o en revisión: aquí el avance real de los artículos manda.
  if (novedades > 0) {
    return {
      texto: `Resuelve ${novedades} novedad(es) abiertas antes de cerrar.`,
      tono: "alerta",
      listoParaCerrarCiclo: false,
    };
  }
  if (progress.total === 0) {
    return { texto: "Packing sin artículos vinculados.", tono: "alerta", listoParaCerrarCiclo: false };
  }
  if (progress.completo) {
    return {
      texto: "Ciclo completo en todos los artículos. Listo para cerrar ciclo.",
      tono: "listo",
      listoParaCerrarCiclo: true,
    };
  }

  // Se nombra el paso que más artículos tienen pendiente: es la acción que
  // más avanza el packing de una sola pasada.
  const topPaso = getShippingV2PackingTopPendingStep(progress);
  const detalle = topPaso ? ` Lo que más falta: ${topPaso.label} (${topPaso.cantidad}).` : "";
  return {
    texto: `Faltan ${progress.pendientes} de ${progress.total} artículos por completar.${detalle}`,
    tono: "accion",
    listoParaCerrarCiclo: false,
  };
}

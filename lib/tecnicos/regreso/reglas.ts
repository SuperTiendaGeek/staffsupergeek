// Orden cerrada y «Regresó el equipo» — reglas PURAS (rediseño de la orden,
// parte R6 · 22-nov-2026, decisión 2 del dueño).
//
// Antes: una orden "Finalizado Entregado" podía volver a cualquier estado sin
// control, y si el cliente regresaba por una novedad o meses después por
// mantenimiento no había cómo enlazarlo con lo anterior.
//
// Modelo profesional (Orderry "Continuar en una orden nueva", Tekmetric,
// RepairDesk "bloquear cambios a una orden cerrada"):
//   · Una orden entregada (o enviada a reciclaje) queda CERRADA.
//   · Si el equipo vuelve, «Regresó el equipo» crea una orden NUEVA enlazada a
//     la anterior (Garantía · Otra falla · Mantenimiento), con el cliente y el
//     equipo ya puestos.
//   · Solo un administrador reabre una orden cerrada, con motivo, para
//     corregir un error. Queda en la Actividad de la orden.
//
// Sin red ni Airtable: lo usan la ruta de estado, la ruta de regreso y la pantalla.

import { ESTADO_ENTREGADA } from "@/lib/entrega/reglas";
import type { OrigenGarantia } from "@/lib/garantias/plazos";

export const ESTADO_RECICLAJE = "Enviado a Reciclaje";
export const ESTADOS_CERRADOS: readonly string[] = [ESTADO_ENTREGADA, ESTADO_RECICLAJE];

export const esOrdenCerrada = (estado: string | null | undefined): boolean =>
  ESTADOS_CERRADOS.includes((estado ?? "").trim());

export const TIPOS_REGRESO = ["Garantía", "Otra falla", "Mantenimiento"] as const;
export type TipoRegreso = (typeof TIPOS_REGRESO)[number];

export function normalizarTipoRegreso(v: unknown): TipoRegreso | "" {
  const t = typeof v === "string" ? v.trim() : v && typeof v === "object" && "name" in v ? String((v as { name: unknown }).name ?? "") : "";
  return (TIPOS_REGRESO as readonly string[]).includes(t) ? (t as TipoRegreso) : "";
}

export const MOTIVO_REAPERTURA_MIN = 10;
export const MOTIVO_REAPERTURA_MAX = 300;
export const MOTIVO_INGRESO_MIN = 5;
export const MOTIVO_INGRESO_MAX = 1000;

type Revision = { ok: true } | { ok: false; error: string; status: number };

/**
 * ¿Se puede cambiar el estado? Desde una orden abierta, sí (las demás reglas
 * siguen en la ruta). Desde una cerrada, solo un administrador y con motivo.
 */
export function revisarCambioDeEstado(o: {
  estadoActual: string;
  nuevoEstado: string;
  esAdmin: boolean;
  motivo?: string | null;
}): Revision & { reapertura?: boolean } {
  if (!esOrdenCerrada(o.estadoActual)) return { ok: true, reapertura: false };
  if (o.nuevoEstado === o.estadoActual) return { ok: true, reapertura: false };
  if (!o.esAdmin) {
    return {
      ok: false,
      status: 403,
      error: o.estadoActual === ESTADO_ENTREGADA
        ? "La orden está entregada y cerrada. Si el equipo volvió, usa «Regresó el equipo»."
        : "La orden está cerrada. Solo un administrador puede reabrirla.",
    };
  }
  const motivo = (o.motivo ?? "").trim();
  if (motivo.length < MOTIVO_REAPERTURA_MIN) {
    return { ok: false, status: 400, error: `Escribe por qué se reabre (mínimo ${MOTIVO_REAPERTURA_MIN} letras).` };
  }
  if (motivo.length > MOTIVO_REAPERTURA_MAX) {
    return { ok: false, status: 400, error: `El motivo es muy largo (máximo ${MOTIVO_REAPERTURA_MAX} letras).` };
  }
  return { ok: true, reapertura: true };
}

export const textoReapertura = (o: { estadoActual: string; nuevoEstado: string; motivo: string; admin: string }): string =>
  `Orden reabierta por ${o.admin || "un administrador"} (${o.estadoActual} → ${o.nuevoEstado}): ${o.motivo.trim()}`;

/** ¿Se puede registrar el regreso? Solo desde una orden entregada. */
export function revisarRegreso(o: { estadoActual: string; tipo: unknown; motivo: unknown }): Revision & { tipo?: TipoRegreso; motivo?: string } {
  if ((o.estadoActual ?? "").trim() !== ESTADO_ENTREGADA) {
    return { ok: false, status: 409, error: "Solo una orden entregada puede registrar que el equipo regresó." };
  }
  const tipo = normalizarTipoRegreso(o.tipo);
  if (!tipo) return { ok: false, status: 400, error: "Elige por qué regresa: Garantía, Otra falla o Mantenimiento." };
  const motivo = typeof o.motivo === "string" ? o.motivo.trim() : "";
  if (motivo.length < MOTIVO_INGRESO_MIN) {
    return { ok: false, status: 400, error: "Escribe el motivo de ingreso." };
  }
  if (motivo.length > MOTIVO_INGRESO_MAX) {
    return { ok: false, status: 400, error: `El motivo es muy largo (máximo ${MOTIVO_INGRESO_MAX} letras).` };
  }
  return { ok: true, tipo, motivo };
}

export const textoRegresoEnNueva = (o: { codigoAnterior: string; tipo: TipoRegreso; queFallo?: string | null }): string =>
  `Regresó de ${o.codigoAnterior} · ${o.tipo}${o.queFallo ? `: ${o.queFallo}` : ""}`;

export const textoRegresoEnAnterior = (o: { codigoNueva: string; tipo: TipoRegreso }): string =>
  `Regresó el equipo → ${o.codigoNueva} (${o.tipo})`;

/**
 * «¿Qué falló?»: de todo lo que el cliente puede reclamar (origenesDeGarantia),
 * solo lo que salió con ESTA orden: artículos y servicios de sus documentos
 * (clave "…@recDoc") y las garantías que se entregaron en ella. Vigentes primero.
 */
export function origenesDeLaOrden(origenes: OrigenGarantia[], o: { documentoIds: string[]; codigoOrden: string }): OrigenGarantia[] {
  const docs = new Set(o.documentoIds);
  const propios = origenes.filter((g) => {
    if (g.tipo === "garantia") return g.documento === `Garantía en ${o.codigoOrden}`;
    const doc = g.clave.split("@")[1] ?? "";
    return docs.has(doc);
  });
  return [...propios].sort((a, b) => Number(b.vigente) - Number(a.vigente));
}

/** Texto corto de lo que falló, para la Actividad de la orden nueva. */
export const textoQueFallo = (g: Pick<OrigenGarantia, "nombre" | "vence" | "vigente">): string =>
  `${g.nombre}${g.vence ? ` (garantía ${g.vigente ? "hasta" : "vencida el"} ${g.vence})` : ""}`;

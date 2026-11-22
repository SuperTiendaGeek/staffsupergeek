// Estado de TRABAJO de cada línea del presupuesto — reglas PURAS
// (rediseño de la orden, parte R2 · 22-nov-2026, decisión 1 del dueño).
//
// Antes: la línea solo decía lo que DECIDIÓ el cliente (Propuesta · Aprobada ·
// Cargada · Rechazada). El técnico no tenía cómo marcar su avance y el cliente
// solo veía "Aprobado · en proceso".
//
// Modelo profesional (Salesforce Field Service: estado por línea; Tekmetric:
// "En proceso", "Esperando repuestos"): cada trabajo APROBADO tiene su avance:
//   Por hacer · En proceso · En espera (motivo) · Hecho
// Motivos de espera: Repuesto · Pago del cliente · Respuesta del cliente · Novedad.
//   · "En espera · repuesto" se pone SOLO mientras Logística trae la pieza
//     (bajo pedido sin llegar); al llegar vuelve a "Por hacer". Igual con
//     "Pago del cliente" mientras falta el anticipo del repuesto.
//   · "Novedad" lleva una frase que el cliente ve en su enlace.
//   · El cliente ve el avance de cada trabajo en su enlace.
//
// Sin red ni Airtable: lo usan la ruta, la tarjeta del presupuesto y el enlace.

import type { ClaveSituacion } from "@/lib/compras/reglas";
import type { LineaPresupuesto } from "./reglas";

export const ESTADOS_TRABAJO = ["Por hacer", "En proceso", "En espera", "Hecho"] as const;
export type EstadoTrabajo = (typeof ESTADOS_TRABAJO)[number];

export const MOTIVOS_ESPERA = ["Repuesto", "Pago del cliente", "Respuesta del cliente", "Novedad"] as const;
export type MotivoEspera = (typeof MOTIVOS_ESPERA)[number];

export const NOVEDAD_MIN = 5;
export const NOVEDAD_MAX = 300;

const nombre = (v: unknown): string =>
  typeof v === "string" ? v.trim() : v && typeof v === "object" && "name" in v ? String((v as { name: unknown }).name ?? "").trim() : "";

export function normalizarEstadoTrabajo(v: unknown): EstadoTrabajo | "" {
  const t = nombre(v);
  return (ESTADOS_TRABAJO as readonly string[]).includes(t) ? (t as EstadoTrabajo) : "";
}

export function normalizarMotivoEspera(v: unknown): MotivoEspera | "" {
  const t = nombre(v);
  return (MOTIVOS_ESPERA as readonly string[]).includes(t) ? (t as MotivoEspera) : "";
}

type LineaTrabajo = Pick<LineaPresupuesto, "estado" | "bajoPedido"> & {
  estadoTrabajo?: EstadoTrabajo | "";
  motivoEspera?: MotivoEspera | "";
  novedadCliente?: string;
};

/** Solo un trabajo aprobado tiene avance (lo propuesto o rechazado, no). */
export const lineaConTrabajo = (l: Pick<LineaPresupuesto, "estado">): boolean =>
  l.estado === "Aprobada" || l.estado === "Cargada";

/** Compra de la pieza que todavía no llega (el trabajo espera solo). */
const ESPERA_REPUESTO: ReadonlySet<ClaveSituacion> = new Set(["falta_pedir", "falta_pagar_proveedor", "en_camino"]);

export type Tono = "gris" | "azul" | "ambar" | "verde";

export type TrabajoVisible = {
  estado: EstadoTrabajo;
  motivo: MotivoEspera | "";
  /** Lo puso el sistema (compra de la pieza), no el técnico. */
  automatico: boolean;
  /** Para el taller: "En espera · repuesto". */
  texto: string;
  /** Para el cliente, en su enlace: "Esperando el repuesto". */
  textoCliente: string;
  /** Solo en "Novedad": la frase para el cliente. */
  novedad: string;
  tono: Tono;
};

const TEXTO_MOTIVO: Record<MotivoEspera, { taller: string; cliente: string }> = {
  Repuesto: { taller: "repuesto", cliente: "Esperando el repuesto" },
  "Pago del cliente": { taller: "pago", cliente: "Esperando tu pago" },
  "Respuesta del cliente": { taller: "respuesta", cliente: "Esperando tu respuesta" },
  Novedad: { taller: "novedad", cliente: "Novedad" },
};

function armar(estado: EstadoTrabajo, motivo: MotivoEspera | "", automatico: boolean, novedad: string, compra?: ClaveSituacion | null): TrabajoVisible {
  if (estado === "En espera") {
    const m = motivo || "Novedad";
    const cliente = m === "Repuesto" && compra === "en_camino" ? "Esperando el repuesto · ya viene en camino" : TEXTO_MOTIVO[m].cliente;
    return { estado, motivo: m, automatico, texto: `En espera · ${TEXTO_MOTIVO[m].taller}`, textoCliente: cliente, novedad: m === "Novedad" ? novedad : "", tono: "ambar" };
  }
  if (estado === "En proceso") return { estado, motivo: "", automatico, texto: "En proceso", textoCliente: "En proceso", novedad: "", tono: "azul" };
  if (estado === "Hecho") return { estado, motivo: "", automatico, texto: "Hecho", textoCliente: "Listo", novedad: "", tono: "verde" };
  return { estado: "Por hacer", motivo: "", automatico, texto: "Por hacer", textoCliente: "Pendiente", novedad: "", tono: "gris" };
}

/**
 * El avance que se ve. Lo que marcó el técnico manda; si no marcó nada (o
 * "Por hacer") y es un repuesto bajo pedido que todavía no llega, el sistema
 * lo pone "En espera" solo (repuesto o pago del anticipo).
 */
export function trabajoVisible(l: LineaTrabajo, compra?: ClaveSituacion | null): TrabajoVisible {
  const marcado = normalizarEstadoTrabajo(l.estadoTrabajo) || "Por hacer";
  const novedad = (l.novedadCliente ?? "").trim();
  if (marcado === "Por hacer" && l.bajoPedido && compra) {
    if (compra === "esperando_pago") return armar("En espera", "Pago del cliente", true, "", compra);
    if (ESPERA_REPUESTO.has(compra)) return armar("En espera", "Repuesto", true, "", compra);
  }
  return armar(marcado, normalizarMotivoEspera(l.motivoEspera), false, novedad, compra);
}

export type CambioTrabajo = { estadoTrabajo: EstadoTrabajo; motivoEspera: MotivoEspera | ""; novedadCliente: string };

/** ¿Se puede marcar ese avance? Devuelve lo que se guarda. */
export function revisarCambioTrabajo(o: {
  linea: Pick<LineaPresupuesto, "estado">;
  estado: unknown;
  motivo?: unknown;
  novedad?: unknown;
}): { ok: true; cambio: CambioTrabajo } | { ok: false; error: string } {
  if (!lineaConTrabajo(o.linea)) return { ok: false, error: "Solo un trabajo aprobado por el cliente tiene avance." };
  const estado = normalizarEstadoTrabajo(o.estado);
  if (!estado) return { ok: false, error: "Elige el avance: Por hacer, En proceso, En espera o Hecho." };
  if (estado !== "En espera") return { ok: true, cambio: { estadoTrabajo: estado, motivoEspera: "", novedadCliente: "" } };
  const motivo = normalizarMotivoEspera(o.motivo);
  if (!motivo) return { ok: false, error: "Elige por qué espera." };
  if (motivo !== "Novedad") return { ok: true, cambio: { estadoTrabajo: estado, motivoEspera: motivo, novedadCliente: "" } };
  const novedad = typeof o.novedad === "string" ? o.novedad.trim() : "";
  if (novedad.length < NOVEDAD_MIN) return { ok: false, error: "Escribe qué pasó: el cliente lo ve en su enlace." };
  if (novedad.length > NOVEDAD_MAX) return { ok: false, error: `Muy largo (máximo ${NOVEDAD_MAX} letras).` };
  return { ok: true, cambio: { estadoTrabajo: estado, motivoEspera: motivo, novedadCliente: novedad } };
}

/** La línea en la Actividad de la orden: "Mantenimiento de bisagra → Hecho". */
export function textoActividadTrabajo(descripcion: string, c: CambioTrabajo): string {
  const v = armar(c.estadoTrabajo, c.motivoEspera, false, c.novedadCliente);
  return `${descripcion.trim() || "Trabajo"} → ${v.texto}${v.novedad ? `: ${v.novedad}` : ""}`;
}

/** "2 de 3 hechos" para la barra de etapas (solo trabajos aprobados). */
export function resumenTrabajos(visibles: readonly Pick<TrabajoVisible, "estado">[]): {
  total: number; hechos: number; enEspera: number; enProceso: number; texto: string;
} {
  const total = visibles.length;
  const hechos = visibles.filter((v) => v.estado === "Hecho").length;
  const enEspera = visibles.filter((v) => v.estado === "En espera").length;
  const enProceso = visibles.filter((v) => v.estado === "En proceso").length;
  return { total, hechos, enEspera, enProceso, texto: total ? `${hechos} de ${total} ${total === 1 ? "hecho" : "hechos"}` : "" };
}

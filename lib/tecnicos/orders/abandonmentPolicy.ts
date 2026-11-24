// Política de baja — forma que usan la orden, su mensaje de WhatsApp y la ruta
// «baja interna». Desde el rediseño R8 (24-nov-2026) la regla vive en
// lib/tecnicos/orden/baja.ts: «Esperando Respuesta» cuenta desde el ingreso y
// «Completado» (avisado) desde que se completó. Antes contaba desde la última
// nota de espera y solo para «Esperando Respuesta».

import { DIAS_BAJA, ETIQUETA_BAJA, diasParaBaja, evaluarBaja, mensajeBaja, referenciaBaja } from "@/lib/tecnicos/orden/baja";

export type AbandonmentLevel = "none" | "warning" | "critical";

export type AbandonmentStatus = {
  applies: boolean;
  level: AbandonmentLevel;
  daysWaiting: number | null;
  daysRemaining: number | null;
  referenceDate: string | null;
  /** Desde qué fecha cuenta (R8). */
  desde: "ingreso" | "completada" | null;
  label: string;
  message: string;
};

export type AbandonmentOrderInput = {
  estadoActual?: string | null;
  fechaIngreso?: string | null;
  completadaEl?: string | null;
  estadoCambiadoEl?: string | null;
  clienteAvisado?: string | null;
  // Ya no se usan (regla anterior); se aceptan para no romper a quien los pase.
  ultimaModificacion?: string | null;
  historial?: unknown;
};

export const getAbandonmentStatus = (order: AbandonmentOrderInput, now = new Date()): AbandonmentStatus => {
  const datos = {
    estado: order.estadoActual,
    fechaIngreso: order.fechaIngreso,
    completadaEl: order.completadaEl,
    estadoCambiadoEl: order.estadoCambiadoEl,
    clienteAvisado: order.clienteAvisado,
  };
  const ref = referenciaBaja(datos);
  const baja = evaluarBaja(datos, now);
  const dias = diasParaBaja(datos, now);
  if (!baja) {
    return {
      applies: !!ref, level: "none", daysWaiting: dias, daysRemaining: dias === null ? null : Math.max(0, DIAS_BAJA - dias),
      referenceDate: ref?.fecha ?? null, desde: ref?.desde ?? null, label: "", message: "",
    };
  }
  return {
    applies: true,
    level: baja.nivel === "cumple" ? "critical" : "warning",
    daysWaiting: baja.dias,
    daysRemaining: baja.faltan,
    referenceDate: baja.fecha,
    desde: baja.desde,
    label: ETIQUETA_BAJA[baja.nivel],
    message: mensajeBaja(baja),
  };
};

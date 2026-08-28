// Reglas PURAS de "días sin gestión" para cotizaciones enviadas (estado
// "Cotizado") que esperan respuesta del cliente. Mismo patrón que
// lib/operaciones/cobro.ts: sin Airtable, sin React, testeable por separado.
//
// Referencia de tiempo: "Última Actualización" de Airtable (lastModifiedTime,
// se resetea con cualquier cambio al registro), NO la fecha de creación. Si
// se usara la fecha de creación, una cotización reactivada después de un
// auto-rechazo (ver depuracion.ts) volvería a superar los 15 días de
// inmediato porque esa fecha nunca cambia — con "Última Actualización" el
// contador arranca de nuevo en el momento de la reactivación, que es lo
// correcto.

export const DIAS_ALERTA_ATENCION = 2; // amarillo: 2 a 5 días sin gestión
export const DIAS_ALERTA_URGENTE = 6; // rojo: más de 5 días sin gestión
export const DIAS_MAXIMO_SIN_GESTION = 15; // auto-rechazo por falta de respuesta

export type NivelAlertaGestion = "nueva" | "atencion" | "urgente";

export type AlertaGestion = {
  nivel: NivelAlertaGestion;
  dias: number;
};

/** Días completos transcurridos entre `fechaReferenciaIso` y `ahora`. */
export function calcularDiasSinGestion(fechaReferenciaIso: string, ahora: Date = new Date()): number {
  if (!fechaReferenciaIso) return 0;
  const referencia = new Date(fechaReferenciaIso);
  if (Number.isNaN(referencia.getTime())) return 0;
  const ms = ahora.getTime() - referencia.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

/**
 * Nivel de alerta para una operación. Solo aplica a estado "Cotizado": un
 * Requerimiento todavía no se envió a nadie, y un Aprobado/Pedido/Entregado
 * ya tuvo respuesta del cliente — ninguno de los dos está "esperando".
 */
export function resolverAlertaGestion(
  input: { estado: string; ultimaActualizacion: string },
  ahora: Date = new Date()
): AlertaGestion | null {
  if (input.estado !== "Cotizado") return null;
  const dias = calcularDiasSinGestion(input.ultimaActualizacion, ahora);
  const nivel: NivelAlertaGestion =
    dias >= DIAS_ALERTA_URGENTE ? "urgente" : dias >= DIAS_ALERTA_ATENCION ? "atencion" : "nueva";
  return { nivel, dias };
}

/** true si una operación "Cotizado" lleva demasiado tiempo sin respuesta y debe auto-rechazarse. */
export function debeAutoRechazarse(
  input: { estado: string; ultimaActualizacion: string },
  ahora: Date = new Date()
): boolean {
  if (input.estado !== "Cotizado") return false;
  return calcularDiasSinGestion(input.ultimaActualizacion, ahora) >= DIAS_MAXIMO_SIN_GESTION;
}

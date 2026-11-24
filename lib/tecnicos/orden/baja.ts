// Política de baja (reciclaje) — una sola regla para todo el portal (rediseño R8, 24-nov-2026).
//
// Decisión del dueño:
//   · «Esperando Respuesta» (el cliente no contesta): 90 días desde la fecha de ingreso.
//   · «Completado» y avisado al cliente (no la retira): 90 días desde que se completó.
//   · Completado sin avisar: todavía no cuenta (antes suena «Cliente sin avisar»).
//   · Pendiente y En Proceso: no cuentan (el equipo está en nuestras manos).
// Desde los 60 días es «Próxima a baja»; desde los 90, «Cumple política de baja».
// Este archivo no usa nada del servidor: lo comparten la lista, el tablero, las
// alertas, la orden y la ruta que la envía a reciclaje.

export const DIAS_PROXIMA_BAJA = 60;
export const DIAS_BAJA = 90;
const DIA = 24 * 60 * 60 * 1000;

export type DatosBaja = {
  estado: string | null | undefined;
  fechaIngreso: string | null | undefined;
  /** «Completada el» (lo escribe el portal al pasar a Completado). */
  completadaEl?: string | null;
  /** «Estado cambiado el» (Airtable): respaldo para las completadas antes de R8. */
  estadoCambiadoEl?: string | null;
  clienteAvisado?: string | null;
};

export type Baja = {
  nivel: "proxima" | "cumple";
  dias: number;
  /** Desde qué fecha se cuenta. */
  desde: "ingreso" | "completada";
  fecha: string;
  /** Días que faltan para cumplir la política (0 si ya la cumple). */
  faltan: number;
};

const valida = (x: string | null | undefined): x is string => !!x && Number.isFinite(Date.parse(x));
const normal = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Desde qué fecha cuenta la política para esta orden (null = no le aplica). */
export function referenciaBaja(o: DatosBaja): { desde: Baja["desde"]; fecha: string } | null {
  const estado = normal(o.estado);
  if (estado === "esperando respuesta") return valida(o.fechaIngreso) ? { desde: "ingreso", fecha: o.fechaIngreso } : null;
  if (estado === "completado") {
    if (!valida(o.clienteAvisado)) return null;
    const fecha = [o.completadaEl, o.estadoCambiadoEl, o.clienteAvisado].find(valida);
    return fecha ? { desde: "completada", fecha } : null;
  }
  return null;
}

/** Días enteros desde la fecha de referencia (null si no le aplica). */
export function diasParaBaja(o: DatosBaja, ahora: Date): number | null {
  const ref = referenciaBaja(o);
  if (!ref) return null;
  return Math.max(0, Math.floor((ahora.getTime() - Date.parse(ref.fecha)) / DIA));
}

/** null = la orden no está en la política (o le faltan más de 30 días). */
export function evaluarBaja(o: DatosBaja, ahora: Date): Baja | null {
  const ref = referenciaBaja(o);
  if (!ref) return null;
  const dias = Math.max(0, Math.floor((ahora.getTime() - Date.parse(ref.fecha)) / DIA));
  if (dias < DIAS_PROXIMA_BAJA) return null;
  return { nivel: dias >= DIAS_BAJA ? "cumple" : "proxima", dias, desde: ref.desde, fecha: ref.fecha, faltan: Math.max(0, DIAS_BAJA - dias) };
}

export const ETIQUETA_BAJA: Record<Baja["nivel"], string> = {
  proxima: "Próxima a baja",
  cumple: "Cumple política de baja",
};

/** Una línea para la franja de la orden. */
export function mensajeBaja(b: Baja): string {
  const base = b.desde === "ingreso"
    ? `Lleva ${b.dias} días desde el ingreso sin respuesta del cliente.`
    : `Lleva ${b.dias} días completada y avisada; el cliente no la retira.`;
  return b.nivel === "cumple" ? `${base} Ya se puede enviar a reciclaje.` : `${base} Faltan ${b.faltan} días para la baja.`;
}

/** Lo que queda escrito en la Actividad al enviarla a reciclaje. */
export function motivoReciclaje(b: Baja): string {
  return b.desde === "ingreso"
    ? `Orden enviada a reciclaje por política de baja: ${b.dias} días desde el ingreso sin respuesta del cliente.`
    : `Orden enviada a reciclaje por política de baja: ${b.dias} días desde que se completó y se avisó al cliente, sin retirarla.`;
}

/**
 * Para llenar «Completada el» en las órdenes que ya estaban completadas antes de R8:
 * cuándo cambió su estado por última vez (Airtable lo sabe) o, si no, cuándo se avisó.
 */
export function planCompletadaEl(ordenes: Array<{ id: string; codigo: string; estado: string; completadaEl?: string | null; estadoCambiadoEl?: string | null; clienteAvisado?: string | null }>) {
  return ordenes
    .filter((o) => o.estado === "Completado" && !valida(o.completadaEl))
    .flatMap((o) => {
      const fecha = valida(o.estadoCambiadoEl) ? o.estadoCambiadoEl : valida(o.clienteAvisado) ? o.clienteAvisado : null;
      return fecha ? [{ ordenId: o.id, codigo: o.codigo, fecha, de: valida(o.estadoCambiadoEl) ? "cuando cambió el estado" : "cuando se avisó al cliente" }] : [];
    });
}

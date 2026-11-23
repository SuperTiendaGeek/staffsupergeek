// Etapas de la orden y «Qué sigue» — reglas PURAS (rediseño de la orden,
// parte R1 · tablero 1 aprobado el 22-nov-2026).
//
// La cabecera dice en una línea dónde está la orden y qué falta:
//   Ingreso → Presupuesto → Aprobado → En trabajo (2 de 3 hechos) → Completado → Entregado
// y el botón principal sigue la etapa: en trabajo no hay nada destacado;
// Completado → «Avisar al cliente»; ya avisado → «Entregar»; entregada →
// «Regresó el equipo».

export type ResumenPresupuesto = {
  lineas: number;
  aprobadas: number;
  /** ISO de la primera aprobación del cliente. */
  fechaAprobacion: string | null;
  trabajos: { total: number; hechos: number; enEspera: number; enProceso: number; texto: string };
  esperaRepuesto: boolean;
  esperaPago: boolean;
};

export type DatosEtapas = {
  estado: string;
  fechaIngreso: string | null;
  fechaEntrega?: string | null;
  presupuestoEnviado?: string | null;
  clienteAvisado?: string | null;
};

export type Paso = { nombre: string; detalle: string; estado: "hecho" | "ahora" | "pendiente" };
export type AccionPrincipal = "avisar" | "entregar" | "regreso" | null;

const ENTREGADA = "Finalizado Entregado";
const RECICLAJE = "Enviado a Reciclaje";
const COMPLETADO = "Completado";

export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-EC", { timeZone: "America/Guayaquil", day: "numeric", month: "short" }).replace(".", "");
}

/** Días completos en el taller (hasta la entrega si ya salió). */
export function diasEnTaller(fechaIngreso: string | null, hasta: string | null | undefined, ahora: Date): number {
  if (!fechaIngreso) return 0;
  const ini = new Date(fechaIngreso).getTime();
  const fin = hasta ? new Date(hasta).getTime() : ahora.getTime();
  if (Number.isNaN(ini) || Number.isNaN(fin)) return 0;
  return Math.max(0, Math.floor((fin - ini) / 86_400_000));
}

export function pasosDeLaOrden(o: DatosEtapas, r: ResumenPresupuesto | null): Paso[] {
  const entregada = o.estado === ENTREGADA;
  const completada = entregada || o.estado === COMPLETADO;
  const conLineas = (r?.lineas ?? 0) > 0;
  const aprobado = (r?.aprobadas ?? 0) > 0;
  const t = r?.trabajos;
  const trabajoHecho = completada || (!!t && t.total > 0 && t.hechos === t.total);

  const presupuestoHecho = conLineas || aprobado || completada || o.estado === "Esperando Respuesta";
  const aprobadoHecho = aprobado || completada;
  // La fecha va solo en los pasos cumplidos (un paso pendiente no tiene fecha).
  const pasos: Paso[] = [
    { nombre: "Ingreso", detalle: fechaCorta(o.fechaIngreso), estado: "hecho" },
    { nombre: "Presupuesto", detalle: presupuestoHecho ? fechaCorta(o.presupuestoEnviado) : "", estado: presupuestoHecho ? "hecho" : "pendiente" },
    { nombre: "Aprobado", detalle: aprobadoHecho ? fechaCorta(r?.fechaAprobacion) : "", estado: aprobadoHecho ? "hecho" : "pendiente" },
    { nombre: "En trabajo", detalle: t?.texto ?? "", estado: trabajoHecho ? "hecho" : "pendiente" },
    { nombre: "Completado", detalle: "", estado: completada ? "hecho" : "pendiente" },
    { nombre: "Entregado", detalle: fechaCorta(o.fechaEntrega), estado: entregada ? "hecho" : "pendiente" },
  ];
  // "Ahora" es el primer paso que falta.
  const i = pasos.findIndex((p) => p.estado === "pendiente");
  if (i >= 0 && o.estado !== RECICLAJE) pasos[i] = { ...pasos[i], estado: "ahora" };
  return pasos;
}

export function queSigue(o: DatosEtapas, r: ResumenPresupuesto | null): { texto: string; accion: AccionPrincipal } {
  if (o.estado === RECICLAJE) return { texto: "Enviada a reciclaje", accion: null };
  if (o.estado === ENTREGADA) return { texto: "Entregada · cerrada", accion: "regreso" };
  if (o.estado === COMPLETADO) {
    return o.clienteAvisado
      ? { texto: "Entregar cuando venga el cliente", accion: "entregar" }
      : { texto: "Avisar al cliente que retire su equipo", accion: "avisar" };
  }
  if (!r || r.lineas === 0) return { texto: "Diagnosticar y armar el presupuesto", accion: null };
  if (r.aprobadas === 0) {
    // «Esperando Respuesta» también dice que el presupuesto ya salió (órdenes de antes de R1).
    return o.presupuestoEnviado || o.estado === "Esperando Respuesta"
      ? { texto: "Esperar la respuesta del cliente", accion: null }
      : { texto: "Enviar el presupuesto al cliente", accion: null };
  }
  const t = r.trabajos;
  if (t.total > 0 && t.hechos === t.total) return { texto: "Pasar la orden a Completado", accion: null };
  if (r.esperaPago) return { texto: "Esperar el pago del repuesto", accion: null };
  if (r.esperaRepuesto && t.hechos + t.enEspera === t.total) return { texto: "Esperar el repuesto", accion: null };
  // El conteo «2 de 3 hechos» ya está en la etapa «En trabajo»: aquí no se repite.
  return { texto: "Hacer los trabajos", accion: null };
}

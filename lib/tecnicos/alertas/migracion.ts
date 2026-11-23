// Alertas R10 — plan PURO para poner al día las órdenes abiertas que ya
// existían antes de las alertas (lo usa scripts/rediseno-r10-alertas.ts).
//
// Solo llena campos VACÍOS; nunca cambia lo que alguien ya puso:
//   · «Último movimiento»: fecha de la última entrada de la Actividad hecha por
//     una persona (no cuentan «Contraseña vista», «Alerta pospuesta»,
//     «Responsable» ni las notas que dejaron las migraciones). Sin ninguna:
//     la fecha de ingreso.
//   · «Responsable» (decisión del dueño 22-nov: «es quien la toma»): la última
//     persona que TOMÓ la orden (la pasó a «En Proceso» o «toma la orden»),
//     igual que la regla automática de hoy; si nadie la tomó, quien hizo el
//     último cambio. Solo personas activas en Técnicos (o administradores).
//   · «Cliente avisado», solo en órdenes «Completado»: supuesto para aprobar
//     en la vista previa — al cliente se le avisó cuando la orden pasó a
//     Completado (la última entrada que empieza con «Completado»); si no hay,
//     el último movimiento. Sin esto todas saldrían en rojo «Cliente sin avisar».

import { cuentaComoMovimiento } from "./reglas";

export type EntradaMig = {
  id: string;
  fecha: string;
  texto: string;
  tipo: string;
  autorId: string | null;
  autorNombre: string;
};

export type OrdenMig = {
  id: string;
  codigo: string;
  estado: string;
  fechaIngreso: string;
  responsableId: string | null;
  ultimoMovimiento: string | null;
  clienteAvisado: string | null;
  historial: EntradaMig[];
};

export type PersonaMig = { id: string; nombre: string };

export type AccionMig = {
  ordenId: string;
  codigo: string;
  estado: string;
  campos: Record<string, unknown>;
  movimiento?: { fecha: string; de: string };
  responsable?: { id: string; nombre: string; de: string };
  avisado?: { fecha: string; de: string };
};

export const CAMPO_MOVIMIENTO = "Último movimiento";
export const CAMPO_RESPONSABLE = "Responsable";
export const CAMPO_AVISADO = "Cliente avisado";

const valida = (f: string | null | undefined): f is string => !!f && Number.isFinite(Date.parse(f));
const corto = (t: string) => t.replace(/\s+/g, " ").trim().slice(0, 60);

/** Entradas hechas por una persona (las migraciones no cuentan). */
export function esDePersona(e: Pick<EntradaMig, "autorNombre">): boolean {
  return !/^migraci[oó]n/i.test(e.autorNombre.trim());
}

/** ¿Esta entrada vieja cuenta como movimiento de la orden? */
export function esMovimientoHistorico(e: EntradaMig): boolean {
  return valida(e.fecha) && esDePersona(e) && cuentaComoMovimiento(e.tipo);
}

/** La pasó a «En Proceso» o dijo «toma la orden»: es quien la tomó. */
export const laTomo = (e: Pick<EntradaMig, "texto" | "tipo">) =>
  /^\s*en proceso/i.test(e.texto) || (e.tipo.trim() === "Responsable" && /toma la orden/i.test(e.texto));

const masReciente = (xs: EntradaMig[]) => [...xs].sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha))[0] ?? null;

export function planAlertas(o: { ordenes: OrdenMig[]; personas: PersonaMig[] }): {
  acciones: AccionMig[];
  quedanSinResponsable: Array<{ codigo: string; estado: string }>;
} {
  const personas = new Map(o.personas.map((p) => [p.id, p]));
  const acciones: AccionMig[] = [];
  const quedanSinResponsable: Array<{ codigo: string; estado: string }> = [];

  for (const orden of o.ordenes) {
    const a: AccionMig = { ordenId: orden.id, codigo: orden.codigo, estado: orden.estado, campos: {} };
    const ultima = masReciente(orden.historial.filter(esMovimientoHistorico));
    const movimiento = orden.ultimoMovimiento ?? ultima?.fecha ?? orden.fechaIngreso;

    if (!orden.ultimoMovimiento) {
      a.campos[CAMPO_MOVIMIENTO] = movimiento;
      a.movimiento = { fecha: movimiento, de: ultima ? `${ultima.autorNombre || "?"}: ${corto(ultima.texto)}` : "Fecha de ingreso" };
    }

    if (!orden.responsableId) {
      const dePersona = orden.historial.filter((e) =>
        valida(e.fecha) && e.autorId && personas.has(e.autorId) && e.tipo.trim() !== "Contraseña vista");
      const quien = masReciente(dePersona.filter(laTomo)) ?? masReciente(dePersona);
      if (quien?.autorId) {
        const p = personas.get(quien.autorId)!;
        a.campos[CAMPO_RESPONSABLE] = [p.id];
        a.responsable = { id: p.id, nombre: p.nombre, de: corto(quien.texto) };
      } else quedanSinResponsable.push({ codigo: orden.codigo, estado: orden.estado });
    }

    if (orden.estado === "Completado" && !orden.clienteAvisado) {
      const completado = masReciente(orden.historial.filter((e) => valida(e.fecha) && esDePersona(e) && /^\s*completado/i.test(e.texto)));
      const fecha = completado?.fecha ?? movimiento;
      a.campos[CAMPO_AVISADO] = fecha;
      a.avisado = { fecha, de: completado ? `pasó a Completado: ${corto(completado.texto)}` : "último movimiento" };
    }

    if (Object.keys(a.campos).length) acciones.push(a);
  }
  return { acciones, quedanSinResponsable };
}

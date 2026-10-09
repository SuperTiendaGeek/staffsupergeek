// Activos de la tienda ("Uso local").
//
// ─── Regla de negocio (dueño, 6 y 8-oct-2026 · auditoría Shipping V2, punto 4) ─
//
// · "Uso local" es SOLO para los activos fijos de SUPER GEEK: computadores de
//   facturación, herramientas del técnico, todo lo que la tienda usa para
//   operar y NO vende.
// · UN solo dato decide si un artículo es un activo: la casilla
//   "Es uso local". La pone el sistema (al registrar o con las acciones de
//   abajo); nadie la edita a mano. La etiqueta "Uso local" del Estado Item se
//   deriva de ella. Un activo no se reserva ni se vende.
// · Un activo comprado a un proveedor se paga como cualquier compra (Pagos).
// · Requiere inspección técnica solo si se marca (por defecto no).
// · Tres movimientos, SOLO Administrador, con cantidad y motivo:
//     - Pasar a uso local: mercadería → activo.
//     - Dar de baja: el activo se dañó, se desechó, se perdió o se regaló.
//       No se borra: baja su cantidad y, si llega a 0, queda "Dado de baja".
//       (Punto 5, 8-oct: también sirve para MERCADERÍA que sale sin venderse,
//       solo con sus unidades libres.)
//     - Pasar a la venta: activo → mercadería. Si su categoría pide
//       inspección, la debe pasar de nuevo (estuvo en uso).
//   Si se mueve SOLO una parte de las unidades, esa parte se separa en un
//   artículo propio y el resto sigue donde estaba.
//
// Módulo puro: sin red.

import { requiereInspeccionPorDefecto } from "./item-venta";
import { unidadesLibres } from "./unidades";

function normalize(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export const ESTADO_USO_LOCAL = "Uso local";
export const ESTADO_DADO_DE_BAJA = "Dado de baja";

/** Etiquetas con las que el artículo ya salió de la tienda: no se mueve. */
const ESTADOS_SALIDOS = new Set([
  "vendido", "usado en reparacion", "agotado", "cancelado", "archivado",
  "desarmado completamente", "desarmado parcialmente", "destinado a partes",
  "migrado", "dado de baja",
]);

export type SituacionPago = "sin-pago" | "por-pagar" | "pago-en-curso" | "pagado";

/**
 * ¿Qué pasa con el pago al proveedor de este artículo?
 *  sin-pago      → no se le debe a nadie (regalo, reajuste…).
 *  por-pagar     → se le debe y todavía no está en ningún pago.
 *  pago-en-curso → está en un pago que todavía no se marca pagado.
 *  pagado        → está en un pago pagado.
 */
export function situacionPago(a: {
  requierePago?: boolean | null;
  esRegalo?: boolean | null;
  pagos?: Array<{ estado?: string | null }>;
}): SituacionPago {
  if (a.requierePago !== true || a.esRegalo === true) return "sin-pago";
  const vivos = (a.pagos ?? []).filter((p) => normalize(p.estado) !== "anulado");
  if (vivos.some((p) => normalize(p.estado) === "pagado")) return "pagado";
  if (vivos.length) return "pago-en-curso";
  return "por-pagar";
}

export type ArticuloParaMovimiento = {
  sku?: string | null;
  usoLocal?: boolean | null;
  recibido?: boolean | null;
  estado?: string | null;
  cantidad?: number | null;
  cantidadReservada?: number | null;
  reservado?: boolean | null;
  enPacking?: boolean;
  pago: SituacionPago;
};

export type ModoMovimiento = "todo" | "separar";
export type EvaluacionMovimiento = { ok: true; modo: ModoMovimiento; quedan: number } | { ok: false; motivo: string };

function validarBase(a: ArticuloParaMovimiento, cantidad: number, esAdministrador: boolean, motivo: string): string | null {
  if (!esAdministrador) return "Solo un Administrador puede hacer este movimiento.";
  if ((motivo ?? "").trim().length < 5) return "Escribe el motivo (mínimo 5 caracteres).";
  if (ESTADOS_SALIDOS.has(normalize(a.estado))) return `El artículo ya no está en la tienda (${a.estado}).`;
  const total = Number(a.cantidad) || 0;
  if (!Number.isInteger(cantidad) || cantidad < 1) return "La cantidad debe ser un número entero mayor a 0.";
  if (cantidad > total) return `Solo hay ${total} unidad(es).`;
  return null;
}

/** Para separar unidades el artículo tiene que estar quieto en la tienda. */
function bloqueoParaSeparar(a: ArticuloParaMovimiento): string | null {
  if (a.recibido !== true) return "Para mover solo una parte, el artículo tiene que estar en la tienda (Recibido). Si viene en camino, mueve todas las unidades.";
  if (a.enPacking) return "Está dentro de una caja de Logística: espera a que llegue o mueve todas las unidades.";
  if (a.pago === "pago-en-curso") return "Está en un pago que todavía no se marca pagado. Márcalo pagado (o sácalo del pago) antes de separar unidades.";
  return null;
}

/** Mercadería → activo de la tienda. */
export function evaluarPasarAUsoLocal(
  a: ArticuloParaMovimiento,
  input: { cantidad: number; esAdministrador: boolean; motivo: string }
): EvaluacionMovimiento {
  const base = validarBase(a, input.cantidad, input.esAdministrador, input.motivo);
  if (base) return { ok: false, motivo: base };
  if (a.usoLocal === true) return { ok: false, motivo: "Ya es un activo de la tienda." };
  // Lo apartado para un cliente no se toca.
  const libres = unidadesLibres({ cantidad: a.cantidad, cantidadReservada: a.cantidadReservada, reservado: a.reservado });
  if (input.cantidad > libres) {
    return { ok: false, motivo: `Hay ${libres} unidad(es) libres; las demás están reservadas para un cliente. Libera la reserva primero.` };
  }
  const total = Number(a.cantidad) || 0;
  if (input.cantidad === total) return { ok: true, modo: "todo", quedan: 0 };
  const separar = bloqueoParaSeparar(a);
  if (separar) return { ok: false, motivo: separar };
  return { ok: true, modo: "separar", quedan: total - input.cantidad };
}

/** Activo → mercadería. */
export function evaluarPasarALaVenta(
  a: ArticuloParaMovimiento,
  input: { cantidad: number; esAdministrador: boolean; motivo: string }
): EvaluacionMovimiento {
  const base = validarBase(a, input.cantidad, input.esAdministrador, input.motivo);
  if (base) return { ok: false, motivo: base };
  if (a.usoLocal !== true) return { ok: false, motivo: "No es un activo de la tienda: ya es mercadería." };
  const total = Number(a.cantidad) || 0;
  if (input.cantidad === total) return { ok: true, modo: "todo", quedan: 0 };
  const separar = bloqueoParaSeparar(a);
  if (separar) return { ok: false, motivo: separar };
  return { ok: true, modo: "separar", quedan: total - input.cantidad };
}

/**
 * Dar de baja unidades de un activo o de MERCADERÍA (punto 5, 8-oct: lo que
 * sale sin venderse — se perdió, se dañó sin arreglo, se regaló). Baja la
 * cantidad; con 0 queda "Dado de baja". Una baja NO puede borrar una deuda
 * con el proveedor. En mercadería solo se dan de baja unidades LIBRES: lo
 * reservado para un cliente no se toca.
 */
export function evaluarDarDeBaja(
  a: ArticuloParaMovimiento,
  input: { cantidad: number; esAdministrador: boolean; motivo: string }
): { ok: true; quedan: number; dadoDeBaja: boolean } | { ok: false; motivo: string } {
  const base = validarBase(a, input.cantidad, input.esAdministrador, input.motivo);
  if (base) return { ok: false, motivo: base };
  if (a.recibido !== true) return { ok: false, motivo: "Todavía no llega a la tienda. Si se perdió o llegó dañado, registra una novedad." };
  if (a.usoLocal !== true) {
    const libres = unidadesLibres({ cantidad: a.cantidad, cantidadReservada: a.cantidadReservada, reservado: a.reservado });
    if (input.cantidad > libres) {
      return { ok: false, motivo: `Hay ${libres} unidad(es) libres; las demás están reservadas para un cliente. Libera la reserva primero.` };
    }
  }
  if (a.pago === "por-pagar") {
    return { ok: false, motivo: "Todavía se le debe al proveedor. Registra primero el pago en Pagos: la deuda sigue aunque el activo se haya dañado o perdido." };
  }
  if (a.pago === "pago-en-curso") return { ok: false, motivo: "Está en un pago que todavía no se marca pagado. Márcalo pagado antes de darlo de baja." };
  const quedan = (Number(a.cantidad) || 0) - input.cantidad;
  return { ok: true, quedan, dadoDeBaja: quedan === 0 };
}

/**
 * Revertir una baja hecha por error: devuelve unidades (activo o mercadería).
 * Solo hasta las que se dieron de baja (campo "Unidades dadas de baja").
 */
export function evaluarRevertirBaja(
  a: { usoLocal?: boolean | null; unidadesDadasDeBaja?: number | null },
  input: { cantidad: number; esAdministrador: boolean; motivo: string }
): { ok: true } | { ok: false; motivo: string } {
  if (!input.esAdministrador) return { ok: false, motivo: "Solo un Administrador puede revertir una baja." };
  if ((input.motivo ?? "").trim().length < 5) return { ok: false, motivo: "Escribe el motivo (mínimo 5 caracteres)." };
  const bajas = Number(a.unidadesDadasDeBaja) || 0;
  if (bajas < 1) return { ok: false, motivo: "Este artículo no tiene unidades dadas de baja." };
  if (!Number.isInteger(input.cantidad) || input.cantidad < 1) return { ok: false, motivo: "La cantidad debe ser un número entero mayor a 0." };
  if (input.cantidad > bajas) return { ok: false, motivo: `Solo se dieron de baja ${bajas} unidad(es).` };
  return { ok: true };
}

/** Etiqueta y revisión de un artículo que pasa a ser ACTIVO. */
export function etiquetaComoActivo(a: {
  recibido?: boolean | null;
  estado?: string | null;
  requiereInspeccion?: boolean | null;
  inspeccionFirmada?: boolean | null;
}): string {
  if (a.recibido !== true) return a.estado || "Registrado"; // sigue su camino; al llegar será "Uso local"
  return a.requiereInspeccion === true && a.inspeccionFirmada !== true ? "En revisión" : ESTADO_USO_LOCAL;
}

/**
 * Lo que cambia en un activo que pasa a la VENTA: la inspección vuelve a
 * pedirse según su categoría (estuvo en uso) y se debe firmar de nuevo.
 */
export function valoresComoMercaderia(a: { recibido?: boolean | null; estado?: string | null; categoria?: string | null }): {
  requiereInspeccion: boolean;
  estado: string;
  estadoRevision: string | null;
  reabrirInspeccion: boolean;
} {
  const requiereInspeccion = requiereInspeccionPorDefecto({ categoria: a.categoria });
  if (a.recibido !== true) return { requiereInspeccion, estado: a.estado || "Registrado", estadoRevision: null, reabrirInspeccion: false };
  return {
    requiereInspeccion,
    estado: requiereInspeccion ? "En revisión" : "Disponible",
    estadoRevision: requiereInspeccion ? "Recibido pendiente de revisión" : "Recibido correctamente",
    reabrirInspeccion: requiereInspeccion,
  };
}

/**
 * Pago del artículo NUEVO que se separa: si la compra ya se pagó (o no se
 * debía), la parte separada no se vuelve a pagar. Si todavía se debe, la
 * parte separada también aparece en Pagos (la suma de lo que se debe no cambia).
 */
export function requierePagoParteSeparada(pago: SituacionPago): boolean {
  return pago === "por-pagar";
}

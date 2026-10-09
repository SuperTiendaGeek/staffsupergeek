// Corrección manual de estado (auditoría Shipping V2, punto 5 · 8-oct-2026).
//
// ─── Regla de negocio (dueño) ───────────────────────────────────────────────
// · El "Estado Item" y el "Estado de revisión" los pone SIEMPRE el sistema
//   (llegada, inspección, novedades, venta, despiece, activos…). Nadie los
//   elige a mano en el día a día.
// · Única excepción: "Corregir estado", SOLO Administrador y con motivo
//   obligatorio. Queda en el historial con antes → después.
// · Hay etiquetas que ni el Administrador pone a mano porque tienen su propia
//   acción: Vendido (factura o recibo), Agotado (mejora), Dado de baja (Dar de
//   baja), Uso local (activos), Desarmado / Destinado a partes (despiece),
//   Con novedad (Novedades). Tampoco se corrige DESDE ellas: se deshacen con
//   su acción (anular la factura, revertir la baja…).
// · La corrección no puede contradecir los datos: no pone "Disponible" a algo
//   que no llegó, ni "En tránsito" a algo marcado Recibido, ni "Reservado" a
//   algo con unidades libres.
// · Estados retirados (sin uso, 0 artículos): Usado en reparación, En garantía
//   con proveedor, Archivado y Migrado. Ya no se ofrecen.
//
// Módulo puro: sin red. Lo usan la API y la pantalla.

import { unidadesLibres, normalizarUnidades } from "./unidades";

function normalize(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export type CampoCorregible = "estado" | "revision";

/** Etiquetas del camino ANTES de que el artículo llegue a la tienda. */
const ANTES_DE_LLEGAR = ["Registrado", "Pendiente de pago", "Pagado", "Pendiente de packing", "En packing", "En tránsito"] as const;
/** Etiquetas de un artículo que YA está en la tienda. */
const EN_LA_TIENDA = ["Recibido", "En revisión", "Disponible", "Reservado"] as const;

/** Lo único que un Administrador puede elegir al corregir el Estado Item. */
export const ESTADOS_CORREGIBLES: readonly string[] = [...ANTES_DE_LLEGAR, ...EN_LA_TIENDA, "Cancelado"];

/** Lo único que un Administrador puede elegir al corregir el Estado de revisión. */
export const REVISIONES_CORREGIBLES: readonly string[] = [
  "Pendiente de recepción",
  "Recibido pendiente de revisión",
  "Recibido correctamente",
  "Aceptado con observación",
];

/** Estados que ya no se usan (punto 5): no se ofrecen en ningún lado. */
export const ESTADOS_RETIRADOS: readonly string[] = ["Usado en reparación", "En garantía con proveedor", "Archivado", "Migrado"];

/** Etiquetas que solo pone (y quita) su propia acción. */
const SOLO_SU_ACCION: Record<string, string> = {
  "vendido": "sale de una factura o un recibo; si fue un error, anula el documento",
  "agotado": "sale de una mejora; si fue un error, anula la mejora",
  "dado de baja": "sale de Dar de baja; si fue un error, usa Revertir baja",
  "uso local": "es un activo de la tienda; usa Pasar a la venta",
  "destinado a partes": "lo maneja la pestaña Despiece",
  "desarmado parcialmente": "lo maneja la pestaña Despiece",
  "desarmado completamente": "lo maneja la pestaña Despiece",
};

export type ArticuloParaCorregir = {
  estado?: string | null;
  estadoRevision?: string | null;
  recibido?: boolean | null;
  requiereInspeccion?: boolean | null;
  inspeccionFirmada?: boolean | null;
  usoLocal?: boolean | null;
  cantidad?: number | null;
  cantidadReservada?: number | null;
  reservado?: boolean | null;
  enPacking?: boolean;
  /** Novedades que bloquean (críticas y abiertas). */
  novedadesAbiertas?: number;
  /** ¿Está en un pago que no se anuló? */
  enPagoVivo?: boolean;
};

export type EvaluacionCorreccion = { ok: true } | { ok: false; motivo: string };

/** ¿Todas las unidades del artículo están apartadas para alguien? */
export function todasReservadas(a: { cantidad?: number | null; cantidadReservada?: number | null; reservado?: boolean | null }): boolean {
  return normalizarUnidades(a.cantidad) > 0 && unidadesLibres(a) === 0;
}

/** ¿Se puede abrir "Corregir estado" en este artículo? (para no mostrar un botón inútil) */
export function estadoSeCorrigeAMano(a: { estado?: string | null; usoLocal?: boolean | null }): boolean {
  return a.usoLocal !== true && !(normalize(a.estado) in SOLO_SU_ACCION);
}

const esAntesDeLlegar = (v: string) => ANTES_DE_LLEGAR.some((e) => normalize(e) === normalize(v));

export function evaluarCorreccionEstado(
  a: ArticuloParaCorregir,
  input: { campo: CampoCorregible; valor: string; motivo: string; esAdministrador: boolean }
): EvaluacionCorreccion {
  if (!input.esAdministrador) return { ok: false, motivo: "Solo un Administrador puede corregir el estado a mano." };
  if ((input.motivo ?? "").trim().length < 5) return { ok: false, motivo: "Escribe el motivo (mínimo 5 caracteres)." };
  const valor = (input.valor ?? "").trim();
  const v = normalize(valor);
  const abiertas = Number(a.novedadesAbiertas) || 0;
  if (abiertas > 0) return { ok: false, motivo: "Tiene novedades abiertas: el estado se resuelve en Novedades." };

  if (input.campo === "revision") {
    if (!REVISIONES_CORREGIBLES.some((r) => normalize(r) === v)) {
      return { ok: false, motivo: "Ese estado de revisión no se elige a mano. Un problema (faltante, dañado…) se registra como novedad en Recepción." };
    }
    if (normalize(a.estadoRevision) === v) return { ok: false, motivo: `Ya está en "${valor}".` };
    if (v === "pendiente de recepcion" && a.recibido === true) {
      return { ok: false, motivo: "Está marcado como Recibido. Si no llegó, desmarca Recibido en Recepción." };
    }
    if (v !== "pendiente de recepcion" && a.recibido !== true) {
      return { ok: false, motivo: "Todavía no está marcado como Recibido. Márcalo en Recepción." };
    }
    if (v === "recibido correctamente" && a.requiereInspeccion === true && a.inspeccionFirmada !== true) {
      return { ok: false, motivo: "Requiere inspección y no está firmada. Fírmala en Inspección (o quita “Requiere inspección”)." };
    }
    return { ok: true };
  }

  // ── Estado Item ──
  const actual = normalize(a.estado);
  if (a.usoLocal === true) return { ok: false, motivo: "Es un activo de la tienda: su estado sale de las acciones de activos." };
  if (actual in SOLO_SU_ACCION) return { ok: false, motivo: `"${a.estado}" ${SOLO_SU_ACCION[actual]}.` };
  if (!ESTADOS_CORREGIBLES.some((e) => normalize(e) === v)) {
    const razon = SOLO_SU_ACCION[v];
    return { ok: false, motivo: razon ? `"${valor}" no se pone a mano: ${razon}.` : `"${valor}" no se puede elegir a mano.` };
  }
  if (actual === v) return { ok: false, motivo: `Ya está en "${valor}".` };

  if (v === "cancelado") {
    if (a.recibido === true) return { ok: false, motivo: "Ya está en la tienda: no se cancela. Si salió sin venderse, usa Dar de baja." };
    if (a.enPacking) return { ok: false, motivo: "Está dentro de una caja de Logística: sácalo primero." };
    if (a.enPagoVivo) return { ok: false, motivo: "Está en un pago a proveedor: anula o saca el pago primero." };
    if (normalizarUnidades(a.cantidadReservada) > 0 || a.reservado === true) {
      return { ok: false, motivo: "Tiene unidades reservadas para un cliente: libera la reserva primero." };
    }
    return { ok: true };
  }

  if (normalizarUnidades(a.cantidad) === 0) {
    return { ok: false, motivo: "Tiene 0 unidades. Si la cantidad está mal, corrígela primero." };
  }
  if (esAntesDeLlegar(valor)) {
    if (a.recibido === true) return { ok: false, motivo: "Está marcado como Recibido. Si no llegó, desmarca Recibido en Recepción." };
    if (v === "en packing" && !a.enPacking) return { ok: false, motivo: "No está en ninguna caja. Agrégalo a una caja en Logística." };
    return { ok: true };
  }

  // Ya en la tienda.
  if (a.recibido !== true) return { ok: false, motivo: "Todavía no está marcado como Recibido. Márcalo en Recepción." };
  const pendienteInspeccion = a.requiereInspeccion === true && a.inspeccionFirmada !== true;
  if ((v === "disponible" || v === "reservado") && pendienteInspeccion) {
    return { ok: false, motivo: "Requiere inspección y no está firmada: su estado es En revisión." };
  }
  const reservadoTodo = todasReservadas(a);
  if (v === "disponible" && reservadoTodo) return { ok: false, motivo: "Todas sus unidades están reservadas: su estado es Reservado." };
  if (v === "reservado" && !reservadoTodo) return { ok: false, motivo: "Tiene unidades libres: no está reservado del todo." };
  return { ok: true };
}

// Cancelar una caja (punto 10a de la auditoría, C-5 · decisiones 1a y 2a del
// dueño, 16-oct-2026).
//
// Antes: el Administrador podía cancelar en cualquier etapa (salvo Cerrado
// final) y solo cambiaba la caja. Sus artículos quedaban "En packing" o "En
// tránsito", enlazados a una caja muerta: no se podían quitar, no podían entrar
// a otra caja y no salían en Recepción.
//
// Ahora:
// - Solo se cancela una caja que todavía no salió: "En Proceso" (Armando) o
//   "Cerrado" (cerrada, sin despachar). Una caja en camino no se cancela: si se
//   pierde, cada artículo lleva su novedad "Extraviado" (punto 8).
// - No se cancela mientras tenga un pago de flete, arancel u otros vivo: el
//   Administrador anula primero el pago (con su egreso).
// - Al cancelar, sus artículos salen sueltos, igual que al quitarlos uno por
//   uno: "Pendiente de packing" y sin los costos repartidos de esa caja.
//
// Solo reglas, sin red: las escrituras están en airtable.ts.

import { SHIPPING_V2_ITEM_FIELDS } from "./schema.generated";

function normalizar(valor?: string | null) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Etapas en las que la caja todavía no salió hacia SUPER GEEK. */
export const ESTADOS_CAJA_CANCELABLES = ["En Proceso", "Cerrado"] as const;

export type EvaluacionCancelarCaja = { ok: true } | { ok: false; motivo: string };

export function evaluarCancelarCaja(input: {
  estado?: string | null;
  esAdministrador: boolean;
  motivo?: string | null;
  /** Pagos de flete, arancel u otros NO anulados de esta caja. */
  pagosLogisticaVivos: Array<{ concepto?: string | null; total?: number | null; referencia?: string | null }>;
}): EvaluacionCancelarCaja {
  if (!input.esAdministrador) return { ok: false, motivo: "Solo un Administrador puede cancelar una caja." };
  const estado = normalizar(input.estado);
  if (estado === "cancelado") return { ok: false, motivo: "Esta caja ya está cancelada." };
  if (!ESTADOS_CAJA_CANCELABLES.some((e) => normalizar(e) === estado)) {
    return {
      ok: false,
      motivo: "Solo se cancela una caja que todavía no sale (Armando o Cerrada sin despachar). Si una caja en camino se perdió, registra la novedad \"Extraviado\" en cada artículo.",
    };
  }
  if (!String(input.motivo ?? "").trim()) return { ok: false, motivo: "Escribe el motivo de la cancelación." };
  if (input.pagosLogisticaVivos.length > 0) {
    const detalle = input.pagosLogisticaVivos
      .map((p) => [p.concepto, typeof p.total === "number" ? `$${p.total.toFixed(2)}` : "", p.referencia].filter(Boolean).join(" "))
      .join("; ");
    return {
      ok: false,
      motivo: `La caja tiene pagos registrados (${detalle}). Anúlalos primero desde "Costos logísticos" y luego cancela la caja.`,
    };
  }
  return { ok: true };
}

/**
 * Lo que se escribe en un artículo cuando sale de una caja (al quitarlo o al
 * cancelar la caja): vuelve a "pendiente de caja" y deja de cargar el flete,
 * el arancel y los otros costos de esa caja.
 */
export function camposArticuloFueraDeCaja(actor: string, ahora: string = new Date().toISOString()): Record<string, unknown> {
  const F = SHIPPING_V2_ITEM_FIELDS;
  return {
    [F.estadoItem]: "Pendiente de packing",
    [F.requierePacking]: true,
    [F.modoLogistico]: "Pendiente de packing",
    [F.ultimaActualizacion]: ahora,
    [F.actualizadoPor]: actor,
    [F.unidadesEnPacking]: null,
    [F.fleteAsignadoRegistro]: null,
    [F.arancelAsignadoRegistro]: null,
    [F.otrosCostosAsignadosRegistro]: null,
  };
}

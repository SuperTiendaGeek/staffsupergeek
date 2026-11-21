// Anular un pago de la cuenta — reglas PURAS (auditoría ops, punto 11 · 21-nov-2026).
//
// Hasta hoy cualquier sesión de Técnicos podía anular cualquier abono, aunque
// la cuenta ya tuviera factura o recibo, e incluso un pago con tarjeta en
// línea (PayPhone). Así lo resuelven los sistemas profesionales: en Odoo solo
// el grupo de facturación toca los pagos; QuickBooks anula sin borrar y deja
// el pago marcado como anulado; Orderry saca el pago de la orden pero lo deja
// en la caja.
//
// Decisiones del dueño (21-nov-2026):
//   · Solo un administrador, con motivo obligatorio.
//   · Nunca con factura o recibo vigente en la cuenta: primero se anula el
//     documento (el dinero queda en la cuenta, punto 1).
//   · Un pago con tarjeta en línea no se anula aquí: se devuelve desde el
//     proyecto de Pagos en línea (el dinero está en la pasarela).
//   · Queda constancia: quién, cuándo y por qué (campos nuevos en Abonos) y
//     una línea en el historial de la orden o del pedido.
//
// Sin dependencias de servidor ni de Airtable.

import { esAbonoDeTraspaso } from "./metodos";
import { numeroDeAbono } from "./comprobante-abono";

export const MOTIVOS_ANULACION = ["Registrado dos veces", "Monto equivocado", "Método equivocado", "Otro"] as const;
export type MotivoAnulacion = (typeof MOTIVOS_ANULACION)[number];

/** Métodos que solo existen como pago en línea (la pasarela tiene el dinero). */
const METODOS_EN_LINEA = new Set(["PayPhone"]);

/** ¿El pago entró por la pasarela (enlace del cliente o QR del mostrador)? */
export function esPagoEnLinea(pago: { metodoPago: string | null | undefined; conPagoEnLinea?: boolean }): boolean {
  return !!pago.conPagoEnLinea || METODOS_EN_LINEA.has((pago.metodoPago ?? "").trim());
}

export type BloqueoAnulacion = "ya_anulado" | "no_admin" | "traspaso" | "en_linea" | "documento";

export type PagoParaAnular = {
  estado: string;
  metodoPago: string | null;
  observacion: string | null;
  enLinea: boolean;
};

export type DocumentoParaAnular = { tipo: "factura" | "recibo"; numero: string } | null;

export type RevisionAnulacion =
  | { ok: true }
  | { ok: false; bloqueo: BloqueoAnulacion; mensaje: string };

function nombreDocumento(d: NonNullable<DocumentoParaAnular>): string {
  return `${d.tipo === "factura" ? "la factura" : "el recibo"} ${d.numero}`.trim();
}

/**
 * ¿Se puede anular este pago? El orden importa: primero lo que no depende de
 * quién pregunta (ya anulado), luego el permiso, luego lo que ni un
 * administrador puede hacer desde aquí.
 */
export function revisarAnulacion(input: {
  esAdmin: boolean;
  pago: PagoParaAnular;
  documento: DocumentoParaAnular;
}): RevisionAnulacion {
  const { pago, documento } = input;
  if (pago.estado === "Anulado") return { ok: false, bloqueo: "ya_anulado", mensaje: "Este pago ya está anulado." };
  if (!input.esAdmin) return { ok: false, bloqueo: "no_admin", mensaje: "Solo un administrador puede anular un pago." };
  if (esAbonoDeTraspaso(pago.metodoPago, pago.observacion)) {
    return { ok: false, bloqueo: "traspaso", mensaje: "Un traspaso a pedido aparte no se anula por separado." };
  }
  if (pago.enLinea) return { ok: false, bloqueo: "en_linea", mensaje: "Un pago en línea se devuelve desde Pagos en línea." };
  if (documento) {
    return { ok: false, bloqueo: "documento", mensaje: `Para anular este pago, primero anula ${nombreDocumento(documento)}.` };
  }
  return { ok: true };
}

/** null = motivo válido. "Otro" exige el detalle. */
export function validarMotivoAnulacion(motivo: string | null | undefined, detalle: string | null | undefined): string | null {
  const m = (motivo ?? "").trim();
  if (!(MOTIVOS_ANULACION as readonly string[]).includes(m)) return "Elige el motivo de la anulación.";
  if (m === "Otro" && (detalle ?? "").trim().length < 4) return "Escribe por qué se anula el pago.";
  return null;
}

/** Lo que se guarda en "Motivo de anulación": el motivo y, si hay, el detalle. */
export function textoMotivoAnulacion(motivo: string, detalle?: string | null): string {
  const d = (detalle ?? "").trim();
  if (motivo === "Otro") return d;
  return d ? `${motivo}: ${d}` : motivo;
}

const usd = (n: number) => `$${(Math.round(n * 100) / 100).toFixed(2)}`;

/** La línea del historial de la orden o del pedido. */
export function textoHistorialAnulacion(input: { id: string; idAbono: string | null; monto: number; motivo: string }): string {
  return `Pago ${numeroDeAbono(input)} de ${usd(input.monto)} anulado: ${input.motivo.replace(/\.+$/, "")}.`;
}

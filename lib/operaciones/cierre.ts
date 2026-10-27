// Reglas PURAS para cerrar, retroceder o eliminar una Operación Comercial
// (auditoría Shipping V2, punto 6 · 9-oct-2026). Sin Airtable: testeables.
//
// Decisiones del dueño:
// · Anular un pedido que ya tiene artículo en inventario PREGUNTA qué pasa con
//   el artículo: "Queda como stock" (se sueltan las unidades del cliente y el
//   artículo sigue su camino) o "Se cancela la compra" (solo si todavía no
//   llega y no está en un pago al proveedor).
// · Una operación con artículo no se elimina ni se regresa a Requerimiento,
//   Cotizado o Aprobado: sus unidades quedarían apartadas para siempre (C-7).
// · "Entregado" NO se marca a mano: se marca solo al emitir factura o recibo
//   desde la operación.

export type DestinoArticulo = "stock" | "cancelar";

export type Evaluacion = { ok: true } | { ok: false; motivo: string };

const ANTES_DEL_PEDIDO = new Set(["Requerimiento", "Cotizado", "Aprobado"]);

export const MENSAJE_ENTREGADO_AUTOMATICO =
  "\"Entregado\" se marca solo al emitir la factura o el recibo desde la operación.";

/** ¿Se puede cambiar el estado a mano (tablero o detalle)? */
export function evaluarCambioEstadoOperacion(input: {
  estadoActual: string;
  estadoNuevo: string;
  /** SKU del artículo en inventario, si ya tiene. */
  articuloSku?: string | null;
}): Evaluacion {
  const { estadoActual, estadoNuevo } = input;
  if (estadoNuevo === "Entregado") return { ok: false, motivo: MENSAJE_ENTREGADO_AUTOMATICO };
  if (estadoActual === "Entregado") {
    return { ok: false, motivo: "La operación ya se entregó con su factura o recibo. Para revertirla se anula el documento (o se emite una nota de crédito)." };
  }
  if (input.articuloSku) {
    if (ANTES_DEL_PEDIDO.has(estadoNuevo)) {
      return { ok: false, motivo: `Ya tiene artículo en inventario (${input.articuloSku}): no se puede regresar a "${estadoNuevo}". Si el cliente desiste, anula la operación y elige qué pasa con el artículo.` };
    }
    if (estadoNuevo === "Rechazado") {
      return { ok: false, motivo: `Ya tiene artículo en inventario (${input.articuloSku}): usa "Anular pedido" para elegir qué pasa con el artículo.` };
    }
  }
  return { ok: true };
}

/** ¿Se puede eliminar la operación? */
export function evaluarEliminarOperacion(input: { articuloSku?: string | null }): Evaluacion {
  if (input.articuloSku) {
    return { ok: false, motivo: `No se puede eliminar: ya tiene artículo en inventario (${input.articuloSku}). Anúlala y elige qué pasa con el artículo.` };
  }
  return { ok: true };
}

export type ArticuloDelPedido = {
  sku: string;
  estado?: string | null;
  recibido: boolean;
  enPacking?: boolean;
  /** Pagos a proveedor vinculados que no están anulados. */
  pagos: Array<{ codigo: string; estado: string }>;
  /** ¿Ya tiene factura o recibo? */
  vendido: boolean;
};

const norm = (v?: string | null) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Anular un pedido que YA tiene artículo: ¿se permite el destino elegido? */
export function evaluarAnularPedido(input: {
  desdeOrden?: string | null;
  articulo: ArticuloDelPedido | null;
  destino: DestinoArticulo | null;
}): Evaluacion {
  if (input.desdeOrden) {
    return { ok: false, motivo: `Este pedido es un repuesto de la orden ${input.desdeOrden}: anúlalo desde el presupuesto de la orden (Cancelar / Liberar a inventario).` };
  }
  const a = input.articulo;
  if (!a) return { ok: true };
  const estado = norm(a.estado);
  if (a.vendido || estado === "vendido") {
    return { ok: false, motivo: `${a.sku} ya se facturó o se emitió recibo: corresponde anular el documento o emitir una nota de crédito.` };
  }
  if (estado === "cancelado") return { ok: true }; // la compra ya estaba cancelada
  if (!input.destino) return { ok: false, motivo: "Elige qué pasa con el artículo: queda como stock o se cancela la compra." };
  if (input.destino === "stock") return { ok: true };

  // Cancelar la compra.
  if (a.recibido) return { ok: false, motivo: `${a.sku} ya llegó a la tienda: no se cancela la compra. Elige "Queda como stock".` };
  if (a.enPacking) return { ok: false, motivo: `${a.sku} está dentro de una caja de Logística: no se cancela. Elige "Queda como stock" o sácalo de la caja primero.` };
  const pago = a.pagos[0];
  if (pago) {
    return norm(pago.estado) === "pagado"
      ? { ok: false, motivo: `Ya se le pagó al proveedor (${pago.codigo}). Elige "Queda como stock"; si no va a llegar, registra el reembolso como novedad.` }
      : { ok: false, motivo: `Está en el pago ${pago.codigo} (${pago.estado}). Quítalo de ese pago en Shipping V2 › Pagos, o elige "Queda como stock".` };
  }
  return { ok: true };
}

// ─── Una cuenta = la orden + todas sus operaciones ───────────────────────────
// Auditoría Técnicos y Operaciones, punto 2 — parche provisional (27-oct-2026).
// Hasta que el repuesto bajo pedido deje de ser una operación (puntos 8 y 10),
// una orden y sus operaciones vinculadas son UNA cuenta: un solo documento de
// venta para todas, y se cierran (y reabren) juntas. Antes el bloqueo solo
// miraba el registro desde el que se emitía (OP-2026-000100/102/103/109
// quedaron en "Pedido" con su orden ya cobrada, y desde la operación se podía
// emitir un segundo documento por lo mismo).

export type RegistroCuenta = { tipo: "orden" | "operacion"; recordId: string };

/** Registros de la cuenta, empezando por el de origen; sin repetidos. */
export function armarRegistrosDeLaCuenta(input: {
  origen: RegistroCuenta;
  ordenId: string | null;
  operacionIdsDeLaOrden: string[];
}): RegistroCuenta[] {
  const lista: RegistroCuenta[] = [input.origen];
  if (input.ordenId) lista.push({ tipo: "orden", recordId: input.ordenId });
  for (const id of input.operacionIdsDeLaOrden) lista.push({ tipo: "operacion", recordId: id });
  const vistos = new Set<string>();
  return lista.filter((r) => (vistos.has(r.recordId) ? false : (vistos.add(r.recordId), true)));
}

/** Al emitir el documento de la cuenta se cierran las operaciones vivas. */
export function operacionSeCierraConLaCuenta(estado: string): boolean {
  return estado === "Pedido" || estado === "Aprobado";
}

/** Al anular el documento de la cuenta, lo que se cerró con él vuelve a "Pedido". */
export function operacionSeReabreConLaCuenta(estado: string): boolean {
  return estado === "Entregado";
}

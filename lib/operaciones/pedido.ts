// Cómo nace el artículo en Shipping Items cuando una operación pasa a
// "Pedido". Puro y testeable: sin Airtable.
//
// Antes nacía SIEMPRE con Cantidad 1, "Reservado" en todo el registro, sin
// packing y con "Tracking directo". Caso OP-2026-000060: el cliente pidió 4
// cámaras, se compraron 8 (4 para stock) y viajaron en un packing con otro
// repuesto; el sistema no permitía registrar nada de eso.
//
// Ahora, al pasar a Pedido se decide:
//   · unidadesCompradas — cuántas se le compran al proveedor (≥ las del
//     cliente; lo que sobra queda para stock).
//   · llegada — "tracking" (directo a la tienda) o "packing" (viaja en una
//     caja con otros artículos y entra al flujo de Packings).
// Cantidad Reservada = unidades del cliente; las demás quedan libres.

export type LlegadaPedido = "tracking" | "packing";

export const LLEGADAS_PEDIDO: readonly LlegadaPedido[] = ["tracking", "packing"];

export const MAX_UNIDADES_PEDIDO = 9999;

export type PlanArticuloPedido =
  | {
      ok: true;
      cantidad: number;
      cantidadReservada: number;
      /** Bandera vieja: solo cuando no queda ninguna unidad libre. */
      reservado: boolean;
      requierePacking: boolean;
      modoLogistico: "Tracking directo" | "Pendiente de packing";
    }
  | { ok: false; motivo: string };

export function esLlegadaPedido(valor: unknown): valor is LlegadaPedido {
  return valor === "tracking" || valor === "packing";
}

export function planArticuloDePedido(input: {
  /** Unidades de la opción elegida (lo que el cliente compra). */
  cantidadCliente: number;
  /** Vacío = las mismas del cliente. */
  unidadesCompradas?: number | null;
  /** Vacío = tracking directo (comportamiento anterior). */
  llegada?: LlegadaPedido | null;
}): PlanArticuloPedido {
  const cliente = Number.isInteger(input.cantidadCliente) && input.cantidadCliente > 0 ? input.cantidadCliente : 1;
  const compradas = input.unidadesCompradas ?? cliente;

  if (!Number.isInteger(compradas) || compradas < 1) {
    return { ok: false, motivo: "Las unidades compradas al proveedor deben ser un número entero, al menos 1." };
  }
  if (compradas > MAX_UNIDADES_PEDIDO) {
    return { ok: false, motivo: `Las unidades compradas no pueden pasar de ${MAX_UNIDADES_PEDIDO}.` };
  }
  if (compradas < cliente) {
    return {
      ok: false,
      motivo: `El cliente pidió ${cliente} unidad(es): no se pueden comprar menos (${compradas}). Si cambió el pedido, corrige primero la cantidad de la opción.`,
    };
  }
  if (input.llegada != null && !esLlegadaPedido(input.llegada)) {
    return { ok: false, motivo: "Indica cómo llega el pedido: directo a la tienda o en un packing." };
  }

  const packing = input.llegada === "packing";
  return {
    ok: true,
    cantidad: compradas,
    cantidadReservada: cliente,
    reservado: compradas === cliente,
    requierePacking: packing,
    modoLogistico: packing ? "Pendiente de packing" : "Tracking directo",
  };
}

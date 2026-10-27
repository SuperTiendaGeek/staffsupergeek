// Reglas PURAS de cobro de una Operación Comercial (sin Airtable, sin React,
// testeables). Extraídas para poder cubrir con tests el chip del tablero, que
// es donde el sistema venía mintiendo.
//
// Contexto: "Total Cotizado" es un campo manual de Airtable cuyo único escritor
// vivía en el módulo de Cotizaciones (que apunta a tablas ya inexistentes), así
// que quedó vacío en 41 de 46 operaciones. Como "Saldo Pendiente" es la fórmula
// {Total Cotizado} - {Total Abonado}, el chip mostraba:
//   · "Pagado"   a operaciones parcialmente pagadas (saldo negativo por total 0)
//   · "Sin pago" a operaciones entregadas y sin cobrar (indistinguible de una
//                que todavía no se cotiza)
//   · "Saldo $1350" a una operación Rechazada
// Ahora el total se deriva de la opción elegida y el estado distingue los casos.

import type { EstadoPago } from "@/lib/estado-cuenta/reglas";

export type EstadoCobro =
  | "rechazada" // rechazada y sin dinero dentro
  | "rechazada-con-abono" // rechazada pero el cliente ya había abonado → devolver
  | "sin-cotizar" // no hay ninguna opción cargada todavía
  | "opciones-sin-elegir" // hay opciones cotizadas y enviadas, pero ninguna elegida: aún no hay precio comprometido
  | "sin-cotizar-con-abono" // abonó antes de que se fijara el precio
  | "por-cobrar" // hay precio, no se ha abonado nada
  | "saldo-parcial" // abonó una parte
  | "a-favor" // abonó de más
  | "pagado";

export type ResumenCobro = {
  estado: EstadoCobro;
  /** Monto relevante para el estado (saldo, abono a devolver, etc.). 0 si no aplica. */
  monto: number;
};

/** Tolerancia de centavos para no reportar saldos de redondeo. */
const EPS = 0.005;

/**
 * Total cotizado = suma del "Precio Venta Cliente" de las opciones elegidas.
 * "Opción Elegida" es un link múltiple, así que se suman todas (normalmente
 * hay una). Sin opción elegida el total es 0: todavía no hay precio
 * comprometido con el cliente.
 */
export function calcularTotalCotizado(
  opcionElegidaIds: string[],
  preciosPorOpcionId: Map<string, number>
): number {
  return opcionElegidaIds.reduce((sum, id) => sum + (preciosPorOpcionId.get(id) ?? 0), 0);
}

export function resolverEstadoCobro(input: {
  estado: string;
  totalCotizado: number | null;
  totalAbonado: number | null;
  /**
   * Hay al menos una opción cargada (cotizada/enviada al cliente), aunque
   * ninguna esté marcada como "Opción Elegida" todavía. "Opción Elegida" solo
   * se fija al pasar a Aprobado, así que una operación en "Cotizado" con
   * opciones reales caía en "sin-cotizar" — mentía que no se había cotizado
   * nada cuando sí se había enviado una propuesta.
   */
  tieneOpciones?: boolean;
}): ResumenCobro {
  const cotizado = input.totalCotizado ?? 0;
  const abonado = input.totalAbonado ?? 0;
  const saldo = cotizado - abonado;

  // Una operación rechazada no se cobra. Si quedó dinero dentro hay que
  // devolverlo o reasignarlo, y eso sí merece señal.
  if (input.estado === "Rechazado") {
    return abonado > EPS
      ? { estado: "rechazada-con-abono", monto: abonado }
      : { estado: "rechazada", monto: 0 };
  }

  if (cotizado <= EPS) {
    if (abonado > EPS) return { estado: "sin-cotizar-con-abono", monto: abonado };
    return input.tieneOpciones
      ? { estado: "opciones-sin-elegir", monto: 0 }
      : { estado: "sin-cotizar", monto: 0 };
  }

  if (saldo > EPS) {
    return abonado > EPS
      ? { estado: "saldo-parcial", monto: saldo }
      : { estado: "por-cobrar", monto: saldo };
  }

  if (saldo < -EPS) return { estado: "a-favor", monto: Math.abs(saldo) };

  return { estado: "pagado", monto: 0 };
}

// ─── Chip del tablero con la cuenta completa (auditoría ops, punto 4) ────────
//
// Desde que el cliente aprueba, lo que importa es la CUENTA: si el pedido es
// de una orden, la orden y todos sus pedidos son una sola cuenta (un
// documento). Antes el chip miraba solo el precio de ESTE pedido y sus abonos:
// el cliente que pagó todo en la orden salía "Por cobrar" en el tablero.
// Antes de aprobar (Requerimiento, Cotizado) el chip sigue contando la etapa
// de la cotización, que no es un estado de pago.

export type CuentaParaTablero = {
  estadoPago: EstadoPago;
  /** Positivo = falta cobrar; negativo = a favor del cliente. */
  saldo: number;
  /** true si es la cuenta de la orden (orden + todos sus pedidos). */
  deLaOrden: boolean;
};

const ESTADOS_CON_CUENTA = new Set(["Aprobado", "Pedido", "Entregado"]);

export function resolverEstadoCobroTablero(input: {
  estado: string;
  totalCotizado: number | null;
  totalAbonado: number | null;
  tieneOpciones?: boolean;
  tieneOrden?: boolean;
  cuenta?: CuentaParaTablero | null;
}): ResumenCobro {
  // Un pedido rechazado de una orden no "devuelve" nada por su cuenta: el
  // dinero es de la cuenta de la orden y se ve allí.
  if (input.estado === "Rechazado" && input.tieneOrden) return { estado: "rechazada", monto: 0 };

  const c = input.cuenta;
  if (c && ESTADOS_CON_CUENTA.has(input.estado)) {
    switch (c.estadoPago) {
      case "pagado":
        return { estado: "pagado", monto: 0 };
      case "pago_parcial":
        return { estado: "saldo-parcial", monto: c.saldo };
      case "sin_pago":
        return { estado: "por-cobrar", monto: c.saldo };
      case "saldo_a_favor":
        return { estado: "a-favor", monto: Math.abs(c.saldo) };
      case "sin_cargos":
        return { estado: "sin-cotizar", monto: 0 };
    }
  }
  return resolverEstadoCobro(input);
}

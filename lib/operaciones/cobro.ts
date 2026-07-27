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

export type EstadoCobro =
  | "rechazada" // rechazada y sin dinero dentro
  | "rechazada-con-abono" // rechazada pero el cliente ya había abonado → devolver
  | "sin-cotizar" // aún no hay opción elegida: no hay nada que cobrar
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
    return abonado > EPS
      ? { estado: "sin-cotizar-con-abono", monto: abonado }
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

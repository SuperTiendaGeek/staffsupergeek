// Estado de cuenta del cliente — reglas PURAS (auditoría Técnicos y
// Operaciones, punto 4).
//
// UNA sola calculadora para toda la cuenta (la orden + todos sus pedidos, o
// un pedido suelto): cargos, pagos, saldo y ESTADO DE PAGO. La usan por igual
// la pantalla de la orden y de la operación (getCuentaUnificada), el panel de
// Cobros, el chip del tablero de Operaciones, el ticket de abono y la emisión
// de documentos. Antes había tres cálculos vivos que no coincidían:
//   · la cuenta unificada (pantalla de la orden y emisión);
//   · el panel de Cobros, con el campo de Airtable "Total a Pagar NV", que
//     suma el precio del artículo sin mirar cuántas unidades pidió el cliente;
//   · el chip del tablero de Operaciones, que miraba solo el precio de ESE
//     pedido e ignoraba la orden (sus servicios y sus pagos).
//
// Las dos formas de leer los datos —detallada para una cuenta
// (lib/cuenta-unificada) y en bloque para muchas (./lote.ts)— terminan aquí.
//
// Modelo profesional: el libro de cuentas por cobrar de Odoo/NetSuite y el
// "estado de pago" de Shopify, que va SEPARADO del estado de la reparación o
// de la entrega ("pagado" y "entregado" son dos preguntas distintas).
//
// Sin dependencias de servidor ni de Airtable.

import type { CuentaUnificadaAprobadoSinArticulo } from "@/types/cuenta-unificada";
import { aprobadoSinArticulo, type LineaParaCuenta } from "@/lib/tecnicos/presupuesto/reglas";

/** Diferencias de menos de un centavo no son deuda ni saldo a favor. */
export const TOLERANCIA = 0.01;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// ─── Estado de pago ──────────────────────────────────────────────────────────

export type EstadoPago = "sin_cargos" | "sin_pago" | "pago_parcial" | "pagado" | "saldo_a_favor";

export const ETIQUETA_ESTADO_PAGO: Record<EstadoPago, string> = {
  sin_cargos: "Sin cargos",
  sin_pago: "Sin pago",
  pago_parcial: "Pago parcial",
  pagado: "Pagado",
  saldo_a_favor: "Saldo a favor",
};

/**
 * Estado de pago de una cuenta. Dinero recibido sin nada cargado (un anticipo
 * antes de cargar el trabajo) es "saldo a favor": no es "sin cargos".
 */
export function resolverEstadoPago(totalCuenta: number, totalAbonado: number): EstadoPago {
  const conCargos = totalCuenta > TOLERANCIA;
  const pagado = totalAbonado > TOLERANCIA;
  if (!conCargos) return pagado ? "saldo_a_favor" : "sin_cargos";
  const saldo = round2(totalCuenta - totalAbonado);
  if (saldo < -TOLERANCIA) return "saldo_a_favor";
  if (saldo <= TOLERANCIA) return "pagado";
  return pagado ? "pago_parcial" : "sin_pago";
}

// ─── Pagos ───────────────────────────────────────────────────────────────────

export type AbonoParaCuenta = { id: string; monto: number; estado: string };

const ESTADO_ABONO_ANULADO = "Anulado";

/**
 * Suma de los abonos vigentes. Un mismo abono puede llegar por la orden Y por
 * la operación (lleva los dos enlaces): su identidad es su id, se cuenta una
 * sola vez (caso OR000382 ↔ OP-2026-000050). Los anulados no suman.
 */
export function totalPagosVigentes(abonos: readonly AbonoParaCuenta[]): number {
  const porId = new Map<string, AbonoParaCuenta>();
  for (const a of abonos) if (!porId.has(a.id)) porId.set(a.id, a);
  let total = 0;
  for (const a of porId.values()) if (a.estado !== ESTADO_ABONO_ANULADO) total += a.monto || 0;
  return round2(total);
}

// ─── Cargos ──────────────────────────────────────────────────────────────────

/**
 * Lo que se le cobra al cliente por un artículo: su precio por las unidades
 * que ÉL pidió (la "Cantidad" de la opción de la que nació). Si Logística
 * compró más para stock, esas no se le cobran.
 */
export function precioClienteDeItem(precioUnitario: number, cantidad: number): number {
  const unidades = Number.isInteger(cantidad) && cantidad > 0 ? cantidad : 1;
  return round2((Number.isFinite(precioUnitario) ? precioUnitario : 0) * unidades);
}

export type OperacionParaCuenta = {
  id: string;
  /** "Producto Solicitado" de la operación. */
  producto: string;
  estado: string;
  /** "Precio Venta Cliente" (TOTAL de la opción) de la opción elegida; 0 si no hay. */
  precioOpcionElegida: number;
  tieneOpcionElegida: boolean;
  tieneArticulo: boolean;
};

/** Estados en los que el cliente ya aprobó un precio. */
const ESTADOS_OPERACION_CON_PRECIO = new Set(["Aprobado", "Pedido", "Entregado"]);

/**
 * Pedidos aprobados que todavía no tienen su artículo físico.
 *
 * Regla del dueño (fase 3b, órdenes): lo aprobado suma desde la aprobación,
 * aunque el artículo no haya llegado. Las órdenes ya lo hacían por las líneas
 * del presupuesto; a un pedido SIN línea de presupuesto (pedido suelto, o
 * enlazado a mano a una orden) nadie le aplicaba la regla y su pantalla decía
 * "saldo a favor" con el cliente al día (casos reales: OP-2026-000024, $70
 * pagados, en "Pedido" sin artículo; OP-2026-000096, $45; OP-2026-000009,
 * $180). El pedido que SÍ nació de una línea del presupuesto lo cuenta esa
 * línea: aquí se omite para no sumarlo dos veces.
 */
export function pedidosAprobadosSinArticulo(
  operaciones: readonly OperacionParaCuenta[],
  operacionesDelPresupuesto: ReadonlySet<string>,
): CuentaUnificadaAprobadoSinArticulo[] {
  const out: CuentaUnificadaAprobadoSinArticulo[] = [];
  const vistas = new Set<string>();
  for (const op of operaciones) {
    if (vistas.has(op.id)) continue;
    vistas.add(op.id);
    if (!ESTADOS_OPERACION_CON_PRECIO.has(op.estado)) continue;
    if (!op.tieneOpcionElegida || op.tieneArticulo) continue;
    if (operacionesDelPresupuesto.has(op.id)) continue;
    const monto = round2(op.precioOpcionElegida);
    if (monto <= TOLERANCIA) continue;
    out.push({
      id: op.id,
      nombre: op.producto,
      tipo: "Repuesto",
      monto,
      motivo: op.estado === "Aprobado" ? "falta_pedir" : "pendiente",
    });
  }
  return out;
}

/**
 * Todo lo aprobado por el cliente que todavía no tiene su artículo, en la
 * cuenta completa: las líneas del presupuesto (fase 3b) y los pedidos sin
 * línea (ver arriba). La MISMA lista alimenta el total, la pantalla y el
 * bloqueo de la emisión ("la factura espera al artículo").
 */
export function pendientesDeLaCuenta(input: {
  lineas: readonly LineaParaCuenta[];
  /** Servicios por Orden de la orden (ids de registro). */
  serviciosIds: ReadonlySet<string>;
  /** Productos Digitales asignados a la orden. */
  digitalesIds: ReadonlySet<string>;
  /** Artículos de stock reservados a la orden. */
  itemsStockIds: ReadonlySet<string>;
  operaciones: readonly OperacionParaCuenta[];
}): CuentaUnificadaAprobadoSinArticulo[] {
  const delPresupuesto = input.lineas.length
    ? aprobadoSinArticulo([...input.lineas], {
        servicios: input.serviciosIds,
        digitales: input.digitalesIds,
        itemsStock: input.itemsStockIds,
        operacionesConArticulo: new Set(input.operaciones.filter((o) => o.tieneArticulo).map((o) => o.id)),
      }).map((p) => ({ id: p.lineaId, nombre: p.descripcion, tipo: p.tipo, monto: p.monto, motivo: p.motivo }))
    : [];
  const operacionesDelPresupuesto = new Set(
    input.lineas.map((l) => l.operacionId).filter((id): id is string => !!id)
  );
  return [...delPresupuesto, ...pedidosAprobadosSinArticulo(input.operaciones, operacionesDelPresupuesto)];
}

export type ItemParaCuenta = { id: string; precio: number };

export type DatosDeCargos = {
  /** Servicios por Orden (rollup "Costo Total Servicios NV"). */
  servicios: number;
  /** Productos Digitales de la orden (rollup "Total Productos Digitales"). */
  productosDigitales: number;
  /** Repuestos del sistema viejo ("Repuestos por Orden"). */
  repuestosHistoricos: number;
  /** Artículos físicos (pedido y stock), con el precio ya por las unidades del cliente. */
  items: readonly ItemParaCuenta[];
  /** Aprobado sin artículo: líneas del presupuesto + pedidos sin línea. */
  aprobadoSinArticulo: readonly CuentaUnificadaAprobadoSinArticulo[];
};

export type CargosDeCuenta = {
  totalRepuestos: number;
  totalServicios: number;
  totalProductosDigitales: number;
  totalAprobadoSinArticulo: number;
  totalCuenta: number;
};

export function sumarCargos(d: DatosDeCargos): CargosDeCuenta {
  const vistos = new Set<string>();
  let items = 0;
  for (const it of d.items) {
    if (vistos.has(it.id)) continue;
    vistos.add(it.id);
    items += it.precio || 0;
  }
  const totalRepuestos = round2(items + (d.repuestosHistoricos || 0));
  const totalServicios = round2(d.servicios || 0);
  const totalProductosDigitales = round2(d.productosDigitales || 0);
  const totalAprobadoSinArticulo = round2(d.aprobadoSinArticulo.reduce((s, p) => s + (p.monto || 0), 0));
  return {
    totalRepuestos,
    totalServicios,
    totalProductosDigitales,
    totalAprobadoSinArticulo,
    totalCuenta: round2(totalRepuestos + totalServicios + totalProductosDigitales + totalAprobadoSinArticulo),
  };
}

// ─── Estado de cuenta ────────────────────────────────────────────────────────

export type EstadoDeCuenta = CargosDeCuenta & {
  totalAbonado: number;
  /** Positivo = falta cobrar. Negativo = saldo a favor del cliente. */
  saldo: number;
  /** Lo que falta cobrar (nunca negativo). */
  porCobrar: number;
  /** Lo que el cliente tiene a favor (nunca negativo). */
  aFavor: number;
  estadoPago: EstadoPago;
};

export function calcularEstadoCuenta(input: {
  cargos: DatosDeCargos;
  abonos: readonly AbonoParaCuenta[];
}): EstadoDeCuenta {
  const cargos = sumarCargos(input.cargos);
  const totalAbonado = totalPagosVigentes(input.abonos);
  const saldo = round2(cargos.totalCuenta - totalAbonado);
  return {
    ...cargos,
    totalAbonado,
    saldo,
    porCobrar: saldo > TOLERANCIA ? saldo : 0,
    aFavor: saldo < -TOLERANCIA ? -saldo : 0,
    estadoPago: resolverEstadoPago(cargos.totalCuenta, totalAbonado),
  };
}

// "Pasar a pedido aparte" — regla PURA (auditoría ops, punto 10C-1 · 12-nov-2026).
// Sin Airtable ni React: con prueba en __tests__/pedido-aparte.test.ts.
//
// Decisiones del dueño (12-nov, Diseno_Fase3_Pedidos.md, 7 y 15):
//   · Un repuesto bajo pedido de una ORDEN que todavía no se entrega puede
//     salir a un PEDIDO ESPECIAL propio (ya aceptado). Lo hace cualquier empleado.
//   · El dinero se va con la línea HASTA SU PRECIO (opción A). Si lo pagado
//     no alcanza, el pedido se lleva lo que haya.
//   · Una cuenta = un documento: el pedido aparte tiene su propia cuenta y
//     su propio documento (cierra el punto 2).
//
// Ejemplo (OR000541, Juan Pérez): bisagras $60 + cargador $55 en camino,
// pagó $80 por transferencia. "Pedido aparte" del cargador →
//   · OP nuevo "Aceptado" con el cargador y $55 (transferencia, misma referencia);
//   · en la orden queda un abono −$55 "Traspaso": la orden queda con $25 y,
//     para entregar la laptop, se cobran $35.
// El traspaso no crea movimientos en Finanzas: el dinero ya entró.

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const TOLERANCIA = 0.005;

// ─── ¿Se puede pasar? ────────────────────────────────────────────────────────

export type LineaParaAparte = {
  id: string;
  tipo: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  estado: string;
  bajoPedido: boolean;
  garantia: string;
  /** La línea ya pertenece a un pedido especial. */
  pedidoId: string | null;
};

export type SolicitudParaAparte = { estado: string; situacionClave: string } | null;

const ORDEN_CERRADA = new Set(["Finalizado Entregado", "Enviado a Reciclaje"]);

/** null = se puede. El mismo texto lo ve el empleado si el servidor lo rechaza. */
export function errorPedidoAparte(input: {
  estadoOrden: string;
  tieneDocumento: boolean;
  linea: LineaParaAparte;
  solicitud: SolicitudParaAparte;
}): string | null {
  const { linea: l, solicitud: s } = input;
  if (ORDEN_CERRADA.has(input.estadoOrden)) return "La orden ya está cerrada.";
  if (input.tieneDocumento) return "La orden ya tiene factura o recibo: anúlalo antes de separar el repuesto.";
  if (l.pedidoId) return "Esta línea ya es de un pedido.";
  if (l.tipo !== "Repuesto" || !l.bajoPedido) return "Solo un repuesto bajo pedido pasa a pedido aparte.";
  if (l.garantia) return "Una línea en garantía se queda en la orden.";
  if (l.estado !== "Aprobada" && l.estado !== "Cargada") return "Solo una línea aprobada pasa a pedido aparte.";
  if (!(l.precioUnitario > 0)) return "La línea no tiene precio.";
  if (!s || s.estado === "Cancelada") return "La línea no tiene una compra viva.";
  if (s.estado === "Entregada" || s.situacionClave === "entregado") return "Ese repuesto ya se entregó.";
  return null;
}

export const totalLinea = (l: Pick<LineaParaAparte, "precioUnitario" | "cantidad">): number =>
  r2(l.precioUnitario * (l.cantidad > 0 ? l.cantidad : 1));

// ─── El dinero ───────────────────────────────────────────────────────────────

export type AbonoParaTraspaso = {
  id: string;
  monto: number;
  estado: string;
  metodo: string;
  referencia: string;
  /** ISO o aaaa-mm-dd. */
  fecha: string;
};

/** Una parte del dinero que se va: un abono nuevo en el pedido, copia del de origen. */
export type PorcionTraspaso = {
  abonoOrigenId: string;
  metodo: string;
  referencia: string;
  fecha: string;
  monto: number;
};

const vigentes = (abonos: readonly AbonoParaTraspaso[]) => abonos.filter((a) => a.estado !== "Anulado");

/** Lo pagado en la cuenta (abonos vigentes, con los negativos restados). */
export function pagadoNeto(abonos: readonly AbonoParaTraspaso[]): number {
  return r2(vigentes(abonos).reduce((s, a) => s + (a.monto || 0), 0));
}

/** Opción A: la línea se lleva hasta su precio, nunca más de lo pagado. */
export function montoATraspasar(precioLinea: number, abonos: readonly AbonoParaTraspaso[]): number {
  return r2(Math.max(0, Math.min(r2(precioLinea), pagadoNeto(abonos))));
}

/**
 * De qué pagos sale el dinero. Mismo criterio que la factura
 * (calcularFormasPago): las salidas que ya hubo se descuentan de los pagos
 * más recientes y el traspaso también se toma de los más recientes. Así la
 * factura de la orden y la del pedido dicen la forma de pago real (SRI) y
 * su número de transacción.
 *
 * Ej.: efectivo $30 (1-nov) + transferencia $50 (3-nov), se van $55 →
 * transferencia $50 + efectivo $5; a la orden le queda efectivo $25.
 */
export function repartirTraspaso(abonos: readonly AbonoParaTraspaso[], monto: number): PorcionTraspaso[] {
  const entradas = vigentes(abonos)
    .filter((a) => a.monto > 0)
    .map((a, i) => ({ a, i }))
    .sort((x, y) => (x.a.fecha === y.a.fecha ? x.i - y.i : x.a.fecha < y.a.fecha ? -1 : 1))
    .map((x) => x.a);
  const resto = entradas.map((a) => r2(a.monto));
  let salidas = r2(vigentes(abonos).filter((a) => a.monto < 0).reduce((s, a) => s - a.monto, 0));
  for (let i = resto.length - 1; i >= 0 && salidas > TOLERANCIA; i--) {
    const toma = Math.min(resto[i], salidas);
    resto[i] = r2(resto[i] - toma);
    salidas = r2(salidas - toma);
  }
  let falta = r2(Math.max(0, monto));
  const tomado = entradas.map(() => 0);
  for (let i = resto.length - 1; i >= 0 && falta > TOLERANCIA; i--) {
    const toma = r2(Math.min(resto[i], falta));
    tomado[i] = toma;
    falta = r2(falta - toma);
  }
  return entradas
    .map((a, i) => ({ abonoOrigenId: a.id, metodo: a.metodo, referencia: a.referencia, fecha: a.fecha, monto: tomado[i] }))
    .filter((p) => p.monto > TOLERANCIA);
}

// ─── Lo que ve el empleado antes de confirmar ────────────────────────────────

export type ResumenAparte = {
  precioLinea: number;
  pagado: number;
  /** Lo que se va con la línea. */
  alPedido: number;
  /** Lo pagado que queda en la orden. */
  quedaEnOrden: number;
  /** Lo que falta cobrar en la orden después (0 si nada). */
  faltaOrden: number;
  /** Lo que falta en el pedido nuevo (0 si va pagado completo). */
  faltaPedido: number;
};

export function resumenPedidoAparte(input: { precioLinea: number; totalCuentaOrden: number; abonos: readonly AbonoParaTraspaso[] }): ResumenAparte {
  const precio = r2(input.precioLinea);
  const pagado = pagadoNeto(input.abonos);
  const alPedido = montoATraspasar(precio, input.abonos);
  const quedaEnOrden = r2(pagado - alPedido);
  const totalOrden = r2(Math.max(0, input.totalCuentaOrden - precio));
  return {
    precioLinea: precio,
    pagado,
    alPedido,
    quedaEnOrden,
    faltaOrden: r2(Math.max(0, totalOrden - quedaEnOrden)),
    faltaPedido: r2(Math.max(0, precio - alPedido)),
  };
}

// ─── Textos que quedan escritos ──────────────────────────────────────────────

/** Observación del abono que sale de la orden. */
export const observacionSalida = (pedido: string, descripcion: string) =>
  `Traspaso al pedido ${pedido} (${descripcion.trim()}). No mueve caja.`;

/** Observación del abono que entra al pedido (empieza con la marca de traspaso). */
export const observacionEntrada = (orden: string, numeroOrigen: string) =>
  `Traspaso desde la orden ${orden} (abono ${numeroOrigen}). No mueve caja.`;

// Cancelar un pedido especial y sus cargos propios — regla PURA
// (auditoría ops, punto 10C-3a · 13-nov-2026). Con prueba en
// __tests__/cancelacion.test.ts.
//
// Decisión 19 del dueño (12-nov; reemplaza la 8), maqueta 5b aprobada el 13-nov:
//   (a) aún no confirmado con el proveedor → se devuelve el dinero (o saldo a
//       favor, si el cliente prefiere). Lo hace cualquier empleado.
//   (b) confirmado y el proveedor ACEPTA cancelar → se devuelve el dinero menos
//       los "Gastos de cancelación" (directos, comprobables y no recuperables:
//       con prueba). Sin factura.
//   (c) confirmado y el proveedor NO acepta → se insiste en continuar; si no,
//       lo pagado pasa a saldo a favor y el artículo queda para la tienda.
//   (b) y (c) los hacen Staff y Administradores (dueño, 13-nov).
// Devolver dinero pide la cuenta de donde sale y el N.º de transacción (como
// el "Devolver" de la cuenta).

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const TOL = 0.005;

// ─── Cargos propios del pedido (recargo y gastos de cancelación) ─────────────

export const CAMPO_RECARGO = "Recargo por no retiro";
export const CAMPO_RECARGO_QUITADO = "Recargo quitado";
export const CAMPO_GASTOS = "Gastos de cancelación";
export const CAMPO_GASTOS_PRUEBA = "Gastos de cancelación prueba";

export type CargoDelPedido = {
  /** Id sintético: no es un registro de Airtable. */
  id: string;
  nombre: string;
  costo: number;
  /** El recargo va en la factura del pedido; los gastos de cancelación no (dueño, 12-nov). */
  facturable: boolean;
};

const numero = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Lo que la calculadora de la cuenta suma además de los artículos del pedido. */
export function cargosDelPedido(pedidoId: string, campos: Record<string, unknown>): CargoDelPedido[] {
  const out: CargoDelPedido[] = [];
  const recargo = r2(numero(campos[CAMPO_RECARGO]));
  if (recargo > TOL) out.push({ id: `recargo:${pedidoId}`, nombre: "Recargo por no retiro", costo: recargo, facturable: true });
  const gastos = r2(numero(campos[CAMPO_GASTOS]));
  if (gastos > TOL) out.push({ id: `gastos:${pedidoId}`, nombre: "Gastos de cancelación", costo: gastos, facturable: false });
  return out;
}

export const totalCargosDelPedido = (c: readonly CargoDelPedido[]) => r2(c.reduce((s, x) => s + x.costo, 0));

// ─── Cancelar ────────────────────────────────────────────────────────────────

export type CasoCancelacion = "sin_confirmar" | "proveedor_acepta" | "proveedor_no_acepta";
export type DestinoDinero = "devolver" | "saldo_a_favor";

export type PlanDeCancelacion = {
  caso: CasoCancelacion;
  pagado: number;
  gastos: number;
  devolver: number;
  saldoAFavor: number;
  /** (c): el artículo ya comprado queda en el stock de la tienda. */
  articuloAStock: boolean;
  /** (b): el artículo vuelve al proveedor (lo gestiona Logística). */
  articuloAlProveedor: boolean;
};

export function casoDeCancelacion(confirmado: boolean, proveedorAcepta: boolean | null | undefined): CasoCancelacion | null {
  if (!confirmado) return "sin_confirmar";
  if (proveedorAcepta === true) return "proveedor_acepta";
  if (proveedorAcepta === false) return "proveedor_no_acepta";
  return null;
}

export const ETAPA_CANCELACION: Record<"sin" | "con", string> = {
  sin: "Sin confirmar con el proveedor",
  con: "Confirmado con el proveedor",
};

/** null = se puede. Mismo texto en la pantalla y en el servidor. */
export function planDeCancelacion(input: {
  estado: string;
  motivo: string;
  /** Alguna compra del pedido ya está hecha (solicitud "Comprada" o "Entregada"). */
  confirmado: boolean;
  esStaffOAdmin: boolean;
  proveedorAcepta?: boolean | null;
  /** Lo pagado neto en la cuenta del pedido. */
  pagado: number;
  destino?: DestinoDinero | null;
  gastos?: number | null;
  tienePrueba?: boolean;
}): { ok: true; plan: PlanDeCancelacion } | { ok: false; motivo: string } {
  const no = (motivo: string) => ({ ok: false as const, motivo });
  if (input.estado === "Entregado" || input.estado === "Cancelado") return no(`El pedido ya está ${input.estado.toLowerCase()}.`);
  if (!input.motivo.trim()) return no("Escribe el motivo.");
  if (input.confirmado && !input.esStaffOAdmin) return no("Un pedido confirmado con el proveedor lo cancelan Staff o un administrador.");
  const caso = casoDeCancelacion(input.confirmado, input.proveedorAcepta);
  if (!caso) return no("Indica si el proveedor acepta cancelar.");

  const pagado = r2(Math.max(0, input.pagado || 0));
  const base = { caso, pagado, gastos: 0, devolver: 0, saldoAFavor: 0, articuloAStock: false, articuloAlProveedor: false };

  if (caso === "proveedor_no_acepta") {
    return { ok: true, plan: { ...base, saldoAFavor: pagado, articuloAStock: true } };
  }

  let gastos = 0;
  if (caso === "proveedor_acepta") {
    gastos = r2(Math.max(0, Number(input.gastos) || 0));
    if (gastos > pagado + TOL) return no("Los gastos no pueden pasar de lo pagado.");
    if (gastos > TOL && !input.tienePrueba) return no("Adjunta la prueba de los gastos.");
  }
  const resto = r2(pagado - gastos);
  if (resto > TOL && !input.destino) return no("Elige si se devuelve o queda como saldo a favor.");
  return {
    ok: true,
    plan: {
      ...base,
      gastos,
      devolver: input.destino === "devolver" ? resto : 0,
      saldoAFavor: input.destino === "saldo_a_favor" ? resto : 0,
      articuloAlProveedor: caso === "proveedor_acepta",
    },
  };
}

// ─── Lo que lee el cliente (texto del dueño, 12-nov) ─────────────────────────

export const CONDICIONES_COMPRA = {
  titulo: "Condiciones de compra bajo pedido — SUPER GEEK",
  intro:
    "Los artículos bajo pedido se adquieren a proveedores específicamente por solicitud del cliente, una vez confirmada la compra y recibido el pago acordado.",
  secciones: [
    {
      titulo: "Si cancelas",
      puntos: [
        "Antes de confirmarlo con el proveedor: te devolvemos todo lo que pagaste.",
        "Después de confirmarlo con el proveedor: tu solicitud se evalúa conforme a lo acordado y a la legislación ecuatoriana. Cuando corresponda, acordaremos una solución considerando los gastos directos, comprobables y no recuperables que ocasione la cancelación.",
      ],
    },
    {
      titulo: "Retiro",
      puntos: [
        "Cuando tu pedido llegue, tienes 7 días para retirarlo. Si después de ese plazo aún tienes saldo pendiente, se suma un recargo único del 10 % de ese saldo.",
        "Guardamos tu pedido hasta 3 meses desde su llegada. Pasado ese plazo, el artículo queda a disposición de la tienda y lo que pagaste pasa a saldo a favor, válido por 6 meses.",
      ],
    },
  ],
  cierre:
    "Estas condiciones no limitan los derechos de devolución, garantía ni los demás derechos irrenunciables reconocidos al consumidor por la legislación vigente.",
} as const;

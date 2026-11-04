// Parte de pago — reglas PURAS (decisión del dueño, 2-nov-2026).
//
// El cliente deja un artículo (un disco, un equipo usado) y la tienda se lo
// recibe por un valor acordado, que se descuenta de lo que debe. Ese artículo
// entra al inventario con ese costo y sin pago a proveedor, y queda "por
// revisar" antes de venderlo.
//
// Ejemplo real (OR000522): Curi Teran debía $55 y dejó su SSD de 180 GB por
// $20 → nace SSD-0000xx (costo $20) y la cuenta baja a $35.
//
// Dinero: ningún dinero entra ni sale. En Finanzas queda un Ingreso SIN
// cuenta ("Parte de pago de cliente"); ante el SRI esa parte es compensación
// de deudas (15), como el saldo a favor. La venta no cambia.
//
// Registrarla puede cualquier empleado que cobra; anularla solo un
// administrador, y solo mientras el artículo siga en la tienda sin venderse.

import { METODO_PARTE_DE_PAGO } from "@/lib/cobros/metodos";

export { METODO_PARTE_DE_PAGO };
export const CATEGORIA_FINANZAS_PARTE_DE_PAGO = "Parte de pago de cliente" as const;

const TOL = 0.005;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const dinero = (n: number) => `$${r2(n).toFixed(2)}`;

export type Rechazo = { ok: false; motivo: string };
const NO = (motivo: string): Rechazo => ({ ok: false, motivo });

export type ParteDePagoInput = {
  descripcion: string;
  categoria: string;
  condicion: string;
  valor: number;
  numeroSerie?: string;
};

export type ParteDePagoValida = {
  ok: true;
  descripcion: string;
  categoria: string;
  condicion: string;
  valor: number;
  numeroSerie: string;
};

export function validarParteDePago(
  input: ParteDePagoInput,
  contexto: { porCobrar: number; categorias: readonly string[]; condiciones: readonly string[] },
): ParteDePagoValida | Rechazo {
  const descripcion = input.descripcion?.trim() ?? "";
  if (descripcion.length < 3) return NO("Describe qué deja el cliente (por ejemplo: SSD 180 GB SATA 2.5\").");
  if (!contexto.categorias.includes(input.categoria)) return NO("Elige la categoría del artículo.");
  if (!contexto.condiciones.includes(input.condicion)) return NO("Elige la condición del artículo.");
  const valor = r2(Number(input.valor));
  if (!(valor > 0)) return NO("El valor acordado debe ser mayor a $0.");
  const porCobrar = r2(Math.max(0, contexto.porCobrar));
  if (porCobrar <= TOL) return NO("La cuenta no tiene nada por cobrar.");
  if (valor > porCobrar + TOL) {
    return NO(`El valor (${dinero(valor)}) pasa lo que falta cobrar (${dinero(porCobrar)}). Recíbelo por ${dinero(porCobrar)} como máximo.`);
  }
  return { ok: true, descripcion, categoria: input.categoria, condicion: input.condicion, valor, numeroSerie: input.numeroSerie?.trim() ?? "" };
}

/** Texto del abono en la cuenta: "Parte de pago: SSD 180 GB (SSD-000030)". */
export function observacionParteDePago(descripcion: string, sku: string): string {
  return `Parte de pago: ${descripcion.trim()}${sku ? ` (${sku})` : ""}`;
}

/** Nota interna del artículo: de quién y por cuánto se recibió. */
export function notaArticuloParteDePago(input: { cliente: string; referencia: string; valor: number; registradoPor: string; fecha: string }): string {
  return `[${input.fecha}] Recibido como parte de pago de ${input.cliente || "un cliente"} en ${input.referencia} por ${dinero(input.valor)} (registró ${input.registradoPor}). Revisar antes de vender.`;
}

/** Estados en los que el artículo ya no está libre en la tienda. */
const ESTADOS_QUE_IMPIDEN_ANULAR = new Set(["vendido", "reservado", "dado de baja", "agotado", "en reparacion", "usado en una mejora"]);

const normalizar = (v: string | null | undefined) =>
  String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * Anular una parte de pago (se registró por error): solo un administrador, y
 * solo si el artículo sigue en la tienda sin venderse ni apartarse. Al
 * anularla el artículo se da de baja (vuelve al cliente) y la cuenta vuelve a
 * deber ese valor.
 */
export function validarAnularParteDePago(input: {
  esAdmin: boolean;
  articulo: { sku: string; estado: string; cantidad: number; cantidadReservada: number } | null;
}): { ok: true } | Rechazo {
  if (!input.esAdmin) return NO("Una parte de pago solo la anula un administrador.");
  const a = input.articulo;
  if (!a) return { ok: true };
  if (ESTADOS_QUE_IMPIDEN_ANULAR.has(normalizar(a.estado)) || a.cantidadReservada > 0 || !(a.cantidad > 0)) {
    return NO(`${a.sku} ya no está libre en la tienda (${a.estado || "sin estado"}): no se puede anular esta parte de pago.`);
  }
  return { ok: true };
}

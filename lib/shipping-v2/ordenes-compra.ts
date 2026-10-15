// Órdenes de compra (auditoría Shipping V2, punto 9d · 14-oct-2026).
//
// ─── Regla de negocio (dueño) ───────────────────────────────────────────────
// · Una ORDEN DE COMPRA es lo que se compró en una sola compra a un proveedor:
//   la orden de eBay, la factura de 3R, el pedido a Roberto. Tiene sus
//   artículos (cada uno es un Shipping Item) y el pago se registra UNA vez
//   contra la orden. Así lo hacen Odoo, Shopify o Zoho: la orden agrupa y el
//   pago la paga. Reemplaza la decisión 9b-3 ("el pago es la agrupación").
// · Lo normal es 1 orden = 1 pago, por el total de la orden. El monto no se
//   escribe: es la suma de costo × unidades compradas (los regalos suman 0).
// · Si a una orden ya pagada se le agrega un artículo olvidado, la orden queda
//   "Falta $X" y se registra un pago solo por lo que falta.
// · El costo proveedor ya trae el envío y el impuesto del vendedor. El flete
//   a Ecuador y los aranceles NO van en la orden: son "Costos Logísticos" de
//   la caja o del artículo que viaja solo (9c).
// · Reembolsos del proveedor: punto 16. Roberto (portal) todavía no ve órdenes.
//
// Módulo puro: sin red. Lo usan el servidor, la pantalla y las pruebas.

import { calculateShippingV2PaymentItemSubtotal, type ShippingV2PaymentItemLike } from "@/lib/shipping-v2/payment-calculations";

/** Campos de la tabla "Shipping Órdenes de compra" (creada el 14-oct-2026). */
export const ORDEN_COMPRA_FIELDS = {
  ocId: "OC ID",
  numero: "Número",
  proveedor: "Proveedor",
  numeroProveedor: "Nº del proveedor",
  fechaCompra: "Fecha de compra",
  articulos: "Artículos",
  pagos: "Pagos",
  observaciones: "Observaciones",
  registradoPor: "Registrado por",
  fechaCreacion: "Fecha de creación",
  anulada: "Anulada",
  motivoAnulacion: "Motivo de anulación",
  fechaAnulacion: "Fecha de anulación",
} as const;

function normalize(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** OC-000001 a partir del número que pone Airtable (campo autonumérico). */
export function ocIdDesdeNumero(numero: number | null | undefined): string {
  const n = Number(numero);
  if (!Number.isInteger(n) || n <= 0) return "";
  return `OC-${String(n).padStart(6, "0")}`;
}

// ─── Situación de una orden ─────────────────────────────────────────────────

export type ArticuloDeOrden = ShippingV2PaymentItemLike & {
  id: string;
  sku?: string;
  requierePago?: boolean | null;
  esRegalo?: boolean | null;
  /** Cancelado, anulado o archivado: no cuenta en el total. */
  cancelado?: boolean;
  /** Está en algún pago que no se anuló. */
  enPagoVivo?: boolean;
};

export type PagoDeOrden = {
  id: string;
  estado?: string | null;
  total?: number | null;
};

export type SituacionOrden = "anulada" | "vacia" | "sin-pago" | "falta-respaldo" | "falta" | "pagada";

export const ETIQUETA_SITUACION_ORDEN: Record<SituacionOrden, string> = {
  anulada: "Anulada",
  vacia: "Sin artículos",
  "sin-pago": "Sin pago (regalos)",
  "falta-respaldo": "Falta respaldo",
  falta: "Falta",
  pagada: "Pagada",
};

export type ResumenOrden = {
  situacion: SituacionOrden;
  /** Suma de costo × unidades compradas de lo que se paga (sin regalos ni cancelados). */
  total: number;
  /** Suma de los pagos vivos. */
  pagado: number;
  /** Lo que todavía no está en un pago vivo. */
  falta: number;
  /** Artículos que entran en el próximo pago (requieren pago y no tienen uno vivo). */
  porPagarIds: string[];
  /** Regalos de la orden sin pago vivo: se adjuntan al próximo pago. */
  regalosPorAdjuntarIds: string[];
  /** SKU de lo que no tiene costo o unidades: no se puede pagar así. */
  sinCosto: string[];
  articulos: number;
  regalos: number;
};

function subtotalSeguro(a: ArticuloDeOrden): number | null {
  try {
    return calculateShippingV2PaymentItemSubtotal(a);
  } catch {
    return null;
  }
}

/**
 * Total, pagado y lo que falta de una orden. Lo que falta se calcula por
 * artículos (los que no están en un pago vivo), no restando montos: así un
 * pago por la diferencia lleva justo los artículos que faltaban.
 */
export function resumenOrden(input: {
  anulada?: boolean | null;
  articulos: ArticuloDeOrden[];
  pagos?: PagoDeOrden[];
}): ResumenOrden {
  const vivos = input.articulos.filter((a) => !a.cancelado);
  const pagosVivos = (input.pagos ?? []).filter((p) => normalize(p.estado) !== "anulado");
  const pagado = round2(pagosVivos.reduce((s, p) => s + (Number(p.total) || 0), 0));
  const regalos = vivos.filter((a) => a.esRegalo === true);
  const deCompra = vivos.filter((a) => a.esRegalo !== true && a.requierePago === true);
  const sinCosto: string[] = [];
  let total = 0;
  let falta = 0;
  const porPagarIds: string[] = [];
  for (const a of deCompra) {
    const st = subtotalSeguro(a);
    if (st === null) {
      sinCosto.push(a.sku || a.id);
      continue;
    }
    total += st;
    if (!a.enPagoVivo) {
      falta += st;
      porPagarIds.push(a.id);
    }
  }
  total = round2(total);
  falta = round2(falta);
  const regalosPorAdjuntarIds = regalos.filter((r) => !r.enPagoVivo).map((r) => r.id);
  // Sin costo también impide pagar: cuenta como pendiente.
  const pendientes = porPagarIds.length + sinCosto.length;

  let situacion: SituacionOrden;
  if (input.anulada) situacion = "anulada";
  else if (!vivos.length) situacion = "vacia";
  else if (!deCompra.length) situacion = "sin-pago";
  else if (!pendientes) situacion = "pagada";
  else situacion = pagosVivos.length ? "falta" : "falta-respaldo";

  return {
    situacion,
    total,
    pagado,
    falta,
    porPagarIds,
    regalosPorAdjuntarIds,
    sinCosto,
    articulos: vivos.length,
    regalos: regalos.length,
  };
}

/** Texto corto para un chip: "Pagada", "Falta respaldo $120.00", "Falta $20.00"… */
export function etiquetaSituacionOrden(r: Pick<ResumenOrden, "situacion" | "falta">, formatMoney: (n: number) => string): string {
  if (r.situacion === "falta-respaldo" || r.situacion === "falta") {
    return `${ETIQUETA_SITUACION_ORDEN[r.situacion]} ${formatMoney(r.falta)}`;
  }
  return ETIQUETA_SITUACION_ORDEN[r.situacion];
}

// ─── Validaciones ───────────────────────────────────────────────────────────

/** Cabecera de la orden. Devuelve el error o null. */
export function validarCabeceraOrden(c: { proveedorId?: string | null; fechaCompra?: string | null }): string | null {
  if (!String(c.proveedorId ?? "").trim()) return "Elige el proveedor de la compra.";
  const fecha = String(c.fechaCompra ?? "").trim();
  if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return "La fecha de compra no es válida.";
  return null;
}

/** ¿Puede este artículo entrar en esta orden? Devuelve el error o null. */
export function validarArticuloParaOrden(
  orden: { anulada?: boolean | null; proveedorId?: string | null },
  articulo: { proveedorId?: string | null; tipoOperacion?: string | null }
): string | null {
  if (orden.anulada) return "Esta orden está anulada.";
  const tipo = normalize(articulo.tipoOperacion);
  if (tipo !== "compra a proveedor" && tipo !== "regalo de proveedor") {
    return "Solo las compras y los regalos del proveedor van en una orden de compra.";
  }
  if (String(orden.proveedorId ?? "") !== String(articulo.proveedorId ?? "")) {
    return "El artículo debe ser del mismo proveedor de la orden.";
  }
  return null;
}

/**
 * Quitar un artículo de su orden (solo Administrador, con motivo). Si el
 * artículo ya está en un pago vivo, primero hay que anular ese pago.
 */
export function validarQuitarDeOrden(a: { enPagoVivo?: boolean; motivo?: string | null }): string | null {
  if (a.enPagoVivo) return "Este artículo ya está pagado en la orden: primero anula ese pago.";
  if (String(a.motivo ?? "").trim().length < 5) return "Escribe el motivo (mínimo 5 caracteres).";
  return null;
}

/** Anular un pago (solo Administrador, con motivo). */
export function validarAnularPago(p: { estado?: string | null; concepto?: string | null; motivo?: string | null }): string | null {
  if (normalize(p.estado) === "anulado") return "Este pago ya está anulado.";
  if (String(p.motivo ?? "").trim().length < 5) return "Escribe el motivo (mínimo 5 caracteres).";
  return null;
}

// ─── Filas de "Registrar compra" ────────────────────────────────────────────

/** Una fila de la pantalla: un artículo de la orden (todo en texto, como lo escribe la persona). */
export type LineaCompra = {
  key: string;
  nombre: string;
  sku: string;
  skuProveedor: string;
  marca: string;
  modelo: string;
  numeroSerie: string;
  categoria: string;
  condicion: string;
  /** null = sigue el valor por defecto de la categoría. */
  requiereInspeccion: boolean | null;
  cantidad: string;
  unidad: string;
  costoProveedor: string;
  precioVentaSugerido: string;
  precioVentaFinal: string;
  descripcion: string;
  observacionesInternas: string;
  /** Regalo del proveedor dentro de la orden: costo 0, no suma al pago. */
  regalo: boolean;
  /** Activo de la tienda (uso local): no se vende, no lleva precio. */
  activo: boolean;
};

export function nuevaLinea(key: string, base: Partial<LineaCompra> = {}): LineaCompra {
  return {
    key,
    nombre: "",
    sku: "",
    skuProveedor: "",
    marca: "",
    modelo: "",
    numeroSerie: "",
    categoria: "",
    condicion: "",
    requiereInspeccion: null,
    cantidad: "1",
    unidad: "Unidad",
    costoProveedor: "",
    precioVentaSugerido: "",
    precioVentaFinal: "",
    descripcion: "",
    observacionesInternas: "",
    regalo: false,
    activo: false,
    ...base,
  };
}

/** Copia una fila para un artículo casi igual: se limpian SKU y nº de serie. */
export function duplicarLinea(linea: LineaCompra, key: string): LineaCompra {
  return { ...linea, key, sku: "", numeroSerie: "" };
}

/** "Aplicar a todas": pone la categoría y/o condición en todas las filas. */
export function aplicarATodas(lineas: LineaCompra[], cambios: { categoria?: string; condicion?: string }): LineaCompra[] {
  return lineas.map((l) => ({
    ...l,
    ...(cambios.categoria ? { categoria: cambios.categoria, requiereInspeccion: null } : {}),
    ...(cambios.condicion ? { condicion: cambios.condicion } : {}),
  }));
}

export function numeroDesdeTexto(value: string): number | null {
  const t = String(value ?? "").trim();
  if (!t) return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function enteroPositivo(value: string): number | null {
  const n = numeroDesdeTexto(value);
  return n !== null && Number.isInteger(n) && n > 0 ? n : null;
}

/** Subtotal de una fila (costo × cantidad); regalos 0; null si falta algo. */
export function subtotalLinea(l: Pick<LineaCompra, "cantidad" | "costoProveedor" | "regalo">): number | null {
  if (l.regalo) return 0;
  const cantidad = enteroPositivo(l.cantidad);
  const costo = numeroDesdeTexto(l.costoProveedor);
  if (cantidad === null || costo === null || costo < 0) return null;
  return round2(cantidad * costo);
}

/** Total de la compra (lo que se pagará) y unidades. */
export function totalesLineas(lineas: LineaCompra[]): { total: number; unidades: number; incompletas: number } {
  let total = 0;
  let unidades = 0;
  let incompletas = 0;
  for (const l of lineas) {
    const st = subtotalLinea(l);
    if (st === null) incompletas++;
    else total += st;
    unidades += enteroPositivo(l.cantidad) ?? 0;
  }
  return { total: round2(total), unidades, incompletas };
}

/** Una fila sin nada escrito no se registra (se ignora al guardar). */
export function lineaEnBlanco(l: LineaCompra): boolean {
  return !l.nombre.trim() && !l.costoProveedor.trim() && !l.skuProveedor.trim() && !l.categoria && !l.marca.trim() && !l.modelo.trim();
}

/**
 * Qué le falta a una fila, en palabras cortas (para pintarla en amarillo).
 * El servidor vuelve a validar todo al crear cada artículo.
 */
export function faltantesLinea(l: LineaCompra, ctx: { esCompra: boolean }): string[] {
  const faltan: string[] = [];
  if (!l.nombre.trim()) faltan.push("nombre");
  if (!l.categoria) faltan.push("categoría");
  if (enteroPositivo(l.cantidad) === null) faltan.push("cantidad entera");
  const costo = numeroDesdeTexto(l.costoProveedor);
  if (ctx.esCompra && !l.regalo && !(costo !== null && costo > 0)) faltan.push("costo");
  if (l.regalo && costo !== null && costo !== 0) faltan.push("regalo sin costo");
  const precio = numeroDesdeTexto(l.precioVentaFinal);
  if (!l.activo && l.precioVentaFinal.trim() && (precio === null || precio < 0)) faltan.push("precio válido");
  return faltan;
}

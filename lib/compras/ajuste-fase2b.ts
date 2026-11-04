// Ajuste de datos — auditoría Técnicos y Operaciones, Fase 2B (2-nov-2026).
// PURO: los datos que dio el dueño y las reglas para decidir qué falta hacer.
// El script scripts/ajuste-auditoria-ops-fase2b.ts lee Airtable, llama a esto
// y escribe con las mismas funciones que usan las pantallas.
// Fuente: claude/Fase2_Migracion_datos.md (proyecto).

export const PROVEEDOR = {
  pixelPc: "recurfs2sv6rG1T1g",
  ebay: "recagpOu6hulGjUOM",
  dtc: "recJEG1O2ZoAxVS2h",
  helpCompartes: "recr9cXgyGFmUThLV",
  especialistasMac: "recZDw60BWb9BpSgr",
} as const;

/** Cuentas de pago (lib/shipping-v2/cuentas-pago.ts). */
const SGINGRESOS = "Transferencia SGINGRESOS";
const DEBITO_VISA = "Tarjeta D. Supe Geek ";
const MASTERCARD = "Tarjeta C. Produbanco";

/** Proveedor equivocado en el artículo. */
export const CORRECCIONES_PROVEEDOR: ReadonlyArray<{ sku: string; proveedorId: string; nombre: string }> = [
  { sku: "SSD-000022", proveedorId: PROVEEDOR.pixelPc, nombre: "Pixel PC" },
  { sku: "OTR-000216", proveedorId: PROVEEDOR.ebay, nombre: "eBay" },
  { sku: "OTR-000217", proveedorId: PROVEEDOR.ebay, nombre: "eBay" },
  { sku: "REP-000127", proveedorId: PROVEEDOR.especialistasMac, nombre: "Especialistas MAC" },
];

export type ArticuloNuevo = {
  /** Pedido al que pertenece (se aparta con su solicitud de compra). */
  operacion: string;
  nombre: string;
  categoria: string;
  costo: number;
  regalo?: boolean;
};

export type CompraHistorica = {
  clave: string;
  proveedorId: string;
  proveedor: string;
  /** Fecha de compra y de pago (YYYY-MM-DD). */
  fecha: string;
  /** null = regalo, sin pago. */
  pago: { metodo: "Transferencia bancaria" | "Tarjeta"; cuenta: string } | null;
  skus: string[];
  nuevos: ArticuloNuevo[];
  /** Lo que debe sumar lo que se paga (guarda contra un dato mal leído). */
  total: number;
};

export const COMPRAS: readonly CompraHistorica[] = [
  { clave: "1", proveedorId: PROVEEDOR.pixelPc, proveedor: "Pixel PC", fecha: "2026-10-27", pago: { metodo: "Transferencia bancaria", cuenta: SGINGRESOS }, skus: ["SSD-000022"], nuevos: [], total: 48 },
  { clave: "2", proveedorId: PROVEEDOR.ebay, proveedor: "eBay", fecha: "2026-10-21", pago: { metodo: "Tarjeta", cuenta: MASTERCARD }, skus: ["OTR-000216", "OTR-000217", "OTR-000218", "REP-000137"], nuevos: [], total: 95.7 },
  { clave: "3", proveedorId: PROVEEDOR.ebay, proveedor: "eBay", fecha: "2026-10-21", pago: { metodo: "Tarjeta", cuenta: DEBITO_VISA }, skus: ["REP-000136"], nuevos: [], total: 86.34 },
  { clave: "4", proveedorId: PROVEEDOR.dtc, proveedor: "DTC", fecha: "2026-10-02", pago: { metodo: "Transferencia bancaria", cuenta: SGINGRESOS }, skus: ["PAN-000001"], nuevos: [], total: 71 },
  {
    clave: "5", proveedorId: PROVEEDOR.especialistasMac, proveedor: "Especialistas MAC", fecha: "2026-10-16",
    pago: { metodo: "Transferencia bancaria", cuenta: SGINGRESOS }, skus: ["REP-000127"],
    // El taller regaló el jack; al cliente se le cobran los $5 aprobados.
    nuevos: [{ operacion: "OP-2026-000117", nombre: "Jack de audio MacBook Pro A2251", categoria: "Repuesto", costo: 0, regalo: true }],
    total: 80,
  },
  { clave: "6", proveedorId: PROVEEDOR.helpCompartes, proveedor: "HelpCompartes", fecha: "2026-10-14", pago: { metodo: "Transferencia bancaria", cuenta: SGINGRESOS }, skus: ["OTR-000215"], nuevos: [], total: 39.75 },
  {
    clave: "7", proveedorId: PROVEEDOR.dtc, proveedor: "DTC", fecha: "2026-06-23", pago: { metodo: "Transferencia bancaria", cuenta: SGINGRESOS }, skus: [],
    nuevos: [{ operacion: "OP-2026-000024", nombre: "BATERIA DELL TYPE F62G0 38Wh INTERNA ORIGINAL", categoria: "Batería", costo: 45 }],
    total: 45,
  },
  {
    clave: "8", proveedorId: PROVEEDOR.helpCompartes, proveedor: "HelpCompartes", fecha: "2026-10-01", pago: { metodo: "Transferencia bancaria", cuenta: SGINGRESOS }, skus: [],
    nuevos: [{ operacion: "OP-2026-000096", nombre: "Cargador original HP 19.5V 2.31A 45W", categoria: "Cargador", costo: 34.95 }],
    total: 34.95,
  },
];

/** TEC-000005 ya estaba en la tienda: no fue una compra (OP-131). */
export const REAJUSTES: readonly string[] = ["TEC-000005"];

/** Pedidos vivos con su artículo ya apartado: reciben su solicitud "Comprada". */
export const PEDIDOS_CON_ARTICULO: ReadonlyArray<{ operacion: string; sku: string }> = [
  { operacion: "OP-2026-000106", sku: "OTR-000216" },
  { operacion: "OP-2026-000107", sku: "OTR-000217" },
  { operacion: "OP-2026-000110", sku: "OTR-000218" },
  { operacion: "OP-2026-000115", sku: "REP-000137" },
  { operacion: "OP-2026-000123", sku: "REP-000136" },
  { operacion: "OP-2026-000094", sku: "PAN-000001" },
];

/** Aprobado y sin pedir: nace su solicitud (el chip dirá "Esperando pago del cliente"). */
export const PEDIDOS_POR_COMPRAR: readonly string[] = ["OP-2026-000132"];

/** Ya tiene su documento: se cierra. */
export const PEDIDOS_ENTREGADOS_CON_DOCUMENTO: ReadonlyArray<{ operacion: string; documento: string }> = [
  { operacion: "OP-2026-000111", documento: "REC-000075" },
];

export const BAJAS: ReadonlyArray<{ sku: string; motivo: string }> = [
  {
    sku: "REP-000041",
    motivo: "Batería equivocada de la garantía de OR000425. Se usó en una Dell XPS de inventario que llegó con batería mala y ya se vendió (modelo no registrado). Decisión del dueño, 2-nov-2026.",
  },
];

/** OR000522 (Curi Teran): lo que el empleado no registró. */
export const OR000522 = {
  orden: "OR000522",
  parteDePago: { descripcion: "SSD 180 GB SATA 2.5\" (retirado de la laptop del cliente)", categoria: "SSD", condicion: "Usado", valor: 20 },
  /** De los $35 con tarjeta: $5 cierran la cuenta; los $30 del cargador van como venta adicional al emitir. */
  tarjeta: { metodo: "Tarjeta de crédito", monto: 5 },
  debiaAntes: 25,
} as const;

export type ArticuloLeido = {
  sku: string;
  id: string;
  proveedorId: string | null;
  costo: number | null;
  ordenCompraId: string | null;
  requierePago: boolean;
  enPagoVivo: boolean;
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Qué falta en una compra histórica. Bloquea si un artículo no existe, es de
 * otro proveedor (después de las correcciones), ya está en OTRA orden o en
 * un pago, o si el total no cuadra con el del dueño.
 */
export function revisarCompra(
  c: CompraHistorica,
  articulos: ReadonlyMap<string, ArticuloLeido>,
  ordenExistente: { id: string; pagada: boolean } | null,
): { listo: boolean; acciones: string[]; bloqueos: string[] } {
  const acciones: string[] = [];
  const bloqueos: string[] = [];
  let total = 0;
  for (const sku of c.skus) {
    const a = articulos.get(sku);
    if (!a) { bloqueos.push(`${sku} no existe.`); continue; }
    const correccion = CORRECCIONES_PROVEEDOR.find((x) => x.sku === sku);
    const proveedor = correccion ? correccion.proveedorId : a.proveedorId;
    if (proveedor !== c.proveedorId) bloqueos.push(`${sku} es de otro proveedor (${a.proveedorId ?? "sin proveedor"}).`);
    if (a.ordenCompraId && a.ordenCompraId !== ordenExistente?.id) bloqueos.push(`${sku} ya está en otra orden de compra.`);
    if (a.enPagoVivo && !ordenExistente?.pagada) bloqueos.push(`${sku} ya está en un pago.`);
    if (!a.requierePago && !REAJUSTES.includes(sku)) bloqueos.push(`${sku} no está marcado "Requiere pago".`);
    total += a.costo ?? 0;
  }
  total += c.nuevos.reduce((s, n) => s + (n.regalo ? 0 : n.costo), 0);
  if (Math.abs(r2(total) - c.total) > 0.005) bloqueos.push(`Suma $${r2(total).toFixed(2)} y el dueño dijo $${c.total.toFixed(2)}.`);
  if (ordenExistente?.pagada) return { listo: true, acciones, bloqueos };
  if (!ordenExistente) acciones.push(`Crear orden de compra a ${c.proveedor} del ${c.fecha}`);
  const sinOrden = c.skus.filter((s) => !articulos.get(s)?.ordenCompraId);
  if (sinOrden.length) acciones.push(`Meter en la orden: ${sinOrden.join(", ")}`);
  for (const n of c.nuevos) acciones.push(`Crear ${n.regalo ? "regalo" : "artículo"} "${n.nombre}" ($${n.costo.toFixed(2)}) para ${n.operacion}`);
  if (c.pago) acciones.push(`Registrar el pago $${c.total.toFixed(2)} (${c.pago.metodo}, ${c.pago.cuenta.trim()}) del ${c.fecha}`);
  return { listo: false, acciones, bloqueos };
}

/** Marca de la orden de compra creada por este ajuste (para no crearla dos veces). */
export function marcaCompra(c: Pick<CompraHistorica, "clave">): string {
  return `[Fase 2B · compra ${c.clave}]`;
}

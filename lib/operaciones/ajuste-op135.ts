// Ajuste de datos — OP-2026-000135 (Gabriel Peralta, cargador Asus 45/65W) · 6-nov-2026.
// Regla PURA (sin Airtable): qué falta hacer y qué impide hacerlo.
//
// Qué pasó: el pedido quedó en "Requerimiento" con su anticipo de $30; el
// dueño pasó los $30 a saldo a favor y emitió la factura de mostrador
// 001-002-000000818 con una línea manual, pagada con ese saldo (SAF-000006).
// Al día siguiente se aprobó la opción y nació SOL-000014 "Por comprar".
// El cargador sí se le compró a DTC ($15, pagado desde SGINGRESOS) pero nunca
// se registró en Shipping.
//
// Decisión del dueño (6-nov): registrar la compra real, marcar el cargador
// como vendido con la factura 818 y cerrar la operación; SOL-000014 no debe
// quedar en Compras.
//
// Cómo queda la cuenta del pedido (calculadora única): cargo $30 (la opción)
// y abonos +30 (transferencia) −30 (pasado a saldo a favor) +30 (pagado con
// saldo a favor, que es lo que de verdad pasó en la factura 818) = $0.
// El abono +30 NO crea movimiento en Finanzas ni otro uso de saldo: ese uso
// ya existe (SAF-000006 y el movimiento de la factura). Solo lo enlaza.

export const OP135 = {
  operacion: "OP-2026-000135",
  solicitud: "SOL-000014",
  factura: "001-002-000000818",
  facturaTotal: 30,
  /** Subtotal sin IVA de la línea de la factura (lo que va al Kardex como precio). */
  facturaSubtotal: 26.09,
  saldoUsado: "SAF-000006",
  proveedorId: "recJEG1O2ZoAxVS2h", // DTC
  proveedor: "DTC",
  costo: 15,
  fechaCompra: "2026-11-05",
  pago: { metodo: "Transferencia bancaria", cuenta: "Transferencia SGINGRESOS" },
  articulo: { nombre: "Cargador Asus 45/65W Punta Delgada", categoria: "Cargador", precioVenta: 30 },
  metodoSaldo: "Saldo a favor",
  marca: "[OP-2026-000135]",
} as const;

export type AbonoLeido = { id: string; monto: number; metodo: string; estado: string; saldoIds: string[] };

export type EstadoOp135 = {
  operacion: { id: string; estado: string; facturaIds: string[]; abonos: AbonoLeido[]; opcionElegida: boolean } | null;
  solicitud: { id: string; estado: string; itemId: string | null; operacionId: string | null } | null;
  factura: { id: string; estado: string; total: number; lineaConArticulo: boolean } | null;
  saldo: { id: string; tipo: string; estado: string; monto: number; facturaIds: string[]; abonoIds: string[] } | null;
  /** El cargador en Shipping, si ya se registró. */
  articulo: { id: string; sku: string; estado: string; facturaIds: string[]; ordenCompraId: string | null; pagado: boolean } | null;
};

export type PasoOp135 = "compra" | "pago" | "venta" | "linea-factura" | "enlace-factura" | "abono-saldo" | "entregado";

const vigente = (a: AbonoLeido) => a.estado !== "Anulado";

/** Lo que impide correr el ajuste (si hay algo, no se escribe nada). */
export function bloqueosOp135(e: EstadoOp135): string[] {
  const b: string[] = [];
  if (!e.operacion) b.push(`${OP135.operacion}: no se encontró.`);
  else if (!e.operacion.opcionElegida) b.push(`${OP135.operacion}: no tiene opción elegida.`);
  if (!e.factura) b.push(`Factura ${OP135.factura}: no se encontró.`);
  else {
    if (e.factura.estado !== "AUTORIZADO") b.push(`Factura ${OP135.factura}: está ${e.factura.estado}, no AUTORIZADO.`);
    if (Math.abs(e.factura.total - OP135.facturaTotal) > 0.01) b.push(`Factura ${OP135.factura}: total $${e.factura.total}, se esperaba $${OP135.facturaTotal}.`);
  }
  if (!e.saldo) b.push(`${OP135.saldoUsado}: no se encontró.`);
  else {
    if (e.saldo.tipo !== "Usado" || e.saldo.estado === "Anulado") b.push(`${OP135.saldoUsado}: no es un uso vigente de saldo a favor.`);
    if (Math.abs(e.saldo.monto - OP135.facturaTotal) > 0.01) b.push(`${OP135.saldoUsado}: monto $${e.saldo.monto}, se esperaba $${OP135.facturaTotal}.`);
    if (e.factura && !e.saldo.facturaIds.includes(e.factura.id)) b.push(`${OP135.saldoUsado}: no está enlazado a la factura ${OP135.factura}.`);
  }
  if (!e.solicitud) b.push(`${OP135.solicitud}: no se encontró.`);
  else {
    if (e.operacion && e.solicitud.operacionId !== e.operacion.id) b.push(`${OP135.solicitud}: no es del pedido ${OP135.operacion}.`);
    const nuestra = e.solicitud.estado === "Comprada" && !!e.articulo && e.solicitud.itemId === e.articulo.id;
    if (e.solicitud.estado !== "Por comprar" && !nuestra) b.push(`${OP135.solicitud}: está "${e.solicitud.estado}"${e.solicitud.itemId ? " con otro artículo" : ""}: revisar a mano.`);
  }
  if (e.operacion && e.factura) {
    const otras = e.operacion.facturaIds.filter((id) => id !== e.factura!.id);
    if (otras.length) b.push(`${OP135.operacion}: ya tiene otra factura enlazada: revisar a mano.`);
  }
  if (e.articulo && e.factura && e.articulo.facturaIds.some((id) => id !== e.factura!.id)) {
    b.push(`${e.articulo.sku}: ya está vendido con otra factura.`);
  }
  return b;
}

/** Abono +$30 "Saldo a favor" que ya enlaza SAF-000006. */
export function tieneAbonoDeSaldo(e: EstadoOp135): boolean {
  if (!e.operacion || !e.saldo) return false;
  return e.operacion.abonos.some((a) => vigente(a) && a.metodo === OP135.metodoSaldo && a.monto > 0
    && (a.saldoIds.includes(e.saldo!.id) || e.saldo!.abonoIds.includes(a.id)));
}

/** Lo que falta, en orden. Vacío = ya está todo hecho. */
export function pasosOp135(e: EstadoOp135): PasoOp135[] {
  const p: PasoOp135[] = [];
  if (!e.articulo) p.push("compra");
  if (!e.articulo?.pagado) p.push("pago");
  if (!(e.articulo && e.factura && e.articulo.facturaIds.includes(e.factura.id))) p.push("venta");
  if (!e.factura?.lineaConArticulo) p.push("linea-factura");
  if (!(e.operacion && e.factura && e.operacion.facturaIds.includes(e.factura.id))) p.push("enlace-factura");
  if (!tieneAbonoDeSaldo(e)) p.push("abono-saldo");
  if (e.operacion?.estado !== "Entregado") p.push("entregado");
  return p;
}

/** Suma de los abonos vigentes del pedido después del ajuste (debe igualar el cargo de $30). */
export function abonadoTrasAjuste(e: EstadoOp135): number {
  const hoy = (e.operacion?.abonos ?? []).filter(vigente).reduce((s, a) => s + a.monto, 0);
  return Math.round((hoy + (tieneAbonoDeSaldo(e) ? 0 : OP135.facturaTotal)) * 100) / 100;
}

export const TEXTO_PASO: Record<PasoOp135, string> = {
  compra: `Compra a ${OP135.proveedor} del ${OP135.fechaCompra}: orden de compra + artículo "${OP135.articulo.nombre}" (costo $${OP135.costo}), apartado para ${OP135.operacion}; ${OP135.solicitud} → Comprada (sale de "Por comprar").`,
  pago: `Pago a ${OP135.proveedor} $${OP135.costo} desde SGINGRESOS (${OP135.fechaCompra}), con su egreso en Finanzas.`,
  venta: `El cargador queda Vendido con la factura ${OP135.factura} (se libera lo apartado; Kardex "Venta con factura").`,
  "linea-factura": `Factura ${OP135.factura}: su línea interna (no la del SRI) se enlaza al cargador, para que una anulación o nota de crédito lo devuelva al inventario.`,
  "enlace-factura": `${OP135.operacion} queda enlazada a la factura ${OP135.factura}.`,
  "abono-saldo": `${OP135.operacion}: abono +$${OP135.facturaTotal} "Saldo a favor" enlazado a ${OP135.saldoUsado} (sin movimiento nuevo en Finanzas ni otro uso de saldo).`,
  entregado: `${OP135.operacion} → Entregado, con nota de lo ocurrido.`,
};

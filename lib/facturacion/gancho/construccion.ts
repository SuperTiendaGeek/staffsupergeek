import "server-only";

// Piezas puras del traductor cuentaUnificadaToDatosVenta() (gancho Fase 16
// PR2) — separadas de traductor.ts para poder testearlas sin mockear todo
// el árbol de fetches de getCuentaUnificada(). Ninguna función de aquí toca
// Airtable ni red.

import type { DetalleFactura, TotalImpuesto, Pago } from "../types/factura";
import type { CuentaUnificadaItem, CuentaUnificadaServicio, CuentaUnificadaAbono, CuentaUnificadaRepuestoHistorico, CuentaUnificadaProductoDigital } from "@/types/cuenta-unificada";
import type { ItemDetalleGancho } from "./airtableGancho";
import {
  SERVICIO_IVA_DEFAULT, TARIFA_IVA_SRI, TARIFA_IVA_ITEM_DEFAULT,
  MAPA_METODO_PAGO_SRI, FORMA_PAGO_SALDO_DEFAULT, FORMA_PAGO_FALLBACK,
} from "./config";
// round2/desglosarPrecioConIvaIncluido viven en ivaIncluido.ts (sin
// "server-only") porque FacturacionForm.tsx (client, toggle "Precios
// incluyen IVA") también los necesita. Re-exportadas aquí para no romper
// los imports existentes de este módulo (traductor.ts, tests).
import { round2, desglosarPrecioConIvaIncluido } from "../ivaIncluido";
export { round2, desglosarPrecioConIvaIncluido };

// ─── Derivar tipo de identificación (Decisión, ver diseño §4.1) ──────────────
// 10 dígitos → cédula (05); 13 dígitos terminados en 001 → RUC (04);
// cualquier otra cosa (o sin cliente vinculado) → consumidor final (07).
export function derivarTipoIdentificacion(cedula: string): "04" | "05" | "07" {
  const limpio = cedula.replace(/\D/g, "");
  if (limpio.length === 13 && limpio.endsWith("001")) return "04";
  if (limpio.length === 10) return "05";
  return "07";
}

// ─── Línea de producto (Shipping Item) ───────────────────────────────────────
// item.precio es el precio final CON IVA incluido (Decisión de negocio) —
// se desglosa hacia adentro, precioUnitario/precioTotalSinImpuesto quedan
// en base (sin impuestos), igual que en cualquier otra línea de factura.
export function construirLineaProducto(
  item: Pick<CuentaUnificadaItem, "id" | "nombre" | "precio">,
  detalle: Pick<ItemDetalleGancho, "sku" | "tarifaIva"> | undefined
): DetalleFactura {
  const tarifaKey = detalle?.tarifaIva || "15%";
  const { codigoPorcentaje, tarifa } = TARIFA_IVA_SRI[tarifaKey] ?? TARIFA_IVA_ITEM_DEFAULT;
  const { base, valorIva } = desglosarPrecioConIvaIncluido(item.precio, tarifa);
  return {
    codigoPrincipal: detalle?.sku || undefined,
    descripcion:     item.nombre,
    cantidad:        1,
    precioUnitario:  base,
    descuento:       0,
    precioTotalSinImpuesto: base,
    impuestos: [{ codigo: "2", codigoPorcentaje, tarifa, baseImponible: base, valor: valorIva }],
    tipo:           "producto",
    shippingItemId: item.id,
  };
}

// ─── Línea de repuesto histórico ("Repuestos por Orden") ─────────────────────
//
// Renglones de la tabla anterior al inventario único. La tabla está congelada
// (no se crean más), pero 47 órdenes tienen $3.234 anotados ahí y ese dinero se
// cobró. Hasta aquí NO generaban línea de factura aunque sí sumaran al total de
// la cuenta: facturar una de esas órdenes emitía un documento por los servicios
// solamente (OR000031: $185 de cuenta → factura de $25).
//
// Mismo criterio que el resto: el precio guardado es final CON IVA incluido y
// se desglosa hacia adentro. Se respeta la cantidad del renglón, que a
// diferencia de un Shipping Item puede ser mayor que 1.
export function construirLineaRepuestoHistorico(
  repuesto: Pick<CuentaUnificadaRepuestoHistorico, "nombre" | "cantidad" | "subtotal">,
  indiceUnoBasado: number
): DetalleFactura {
  const { codigoPorcentaje, tarifa } = TARIFA_IVA_ITEM_DEFAULT;
  const cantidad = repuesto.cantidad && repuesto.cantidad > 0 ? repuesto.cantidad : 1;
  const { base, valorIva } = desglosarPrecioConIvaIncluido(repuesto.subtotal, tarifa);
  return {
    codigoPrincipal: `REP-H${indiceUnoBasado}`,
    descripcion: repuesto.nombre,
    cantidad,
    // base es el total del renglón sin impuestos; el unitario se deriva.
    precioUnitario: round2(base / cantidad),
    descuento: 0,
    precioTotalSinImpuesto: base,
    impuestos: [{ codigo: "2", codigoPorcentaje, tarifa, baseImponible: base, valor: valorIva }],
    tipo: "producto",
  };
}

// ─── Línea de servicio ────────────────────────────────────────────────────────
// servicio.costo también es precio final CON IVA incluido (misma decisión).
export function construirLineaServicio(
  servicio: Pick<CuentaUnificadaServicio, "nombre" | "costo">,
  indiceUnoBasado: number
): DetalleFactura {
  const { codigoPorcentaje, tarifa } = SERVICIO_IVA_DEFAULT;
  const { base, valorIva } = desglosarPrecioConIvaIncluido(servicio.costo, tarifa);
  return {
    codigoPrincipal: `SRV-${indiceUnoBasado}`,
    descripcion:     servicio.nombre,
    cantidad:        1,
    precioUnitario:  base,
    descuento:       0,
    precioTotalSinImpuesto: base,
    impuestos: [{ codigo: "2", codigoPorcentaje, tarifa, baseImponible: base, valor: valorIva }],
    tipo: "servicio",
  };
}

// ─── Producto digital ("Productos Digitales") ────────────────────────────────
//
// El precio final: el fijado para esta venta puntual (precioVenta) si existe;
// si no, el precio por defecto del catálogo (precioVentaCatalogo). Compartido
// entre la precondición de abajo y la construcción de la línea para que
// ambas miren exactamente el mismo número.
function resolverPrecioProductoDigital(
  p: Pick<CuentaUnificadaProductoDigital, "precioVenta" | "precioVentaCatalogo">
): number {
  return p.precioVenta > 0 ? p.precioVenta : p.precioVentaCatalogo;
}

// Mismo precedente que construirLineaRepuestoHistorico() más abajo (bueno,
// arriba): una tabla con dinero real vinculado a la orden que SÍ sumaba al
// total de la cuenta (lib/cuenta-unificada/index.ts, rollup "Total Productos
// Digitales") pero no generaba línea de factura — importeTotal quedaba corto
// exactamente por ese monto, en silencio. Mismo síntoma, ahora para licencias
// y cuentas digitales en vez de repuestos.
//
// El precio guardado es FINAL CON IVA incluido, igual que las otras tres
// líneas — se desglosa hacia adentro. La tabla "Productos Digitales" no
// tiene campo de IVA propio (verificado contra el esquema real de Airtable),
// así que se usa la misma tarifa por defecto que los servicios.
export function construirLineaProductoDigital(
  producto: Pick<CuentaUnificadaProductoDigital, "id" | "nombre" | "precioVenta" | "precioVentaCatalogo">,
  indiceUnoBasado: number
): DetalleFactura {
  const { codigoPorcentaje, tarifa } = SERVICIO_IVA_DEFAULT;
  const precioFinal = resolverPrecioProductoDigital(producto);
  const { base, valorIva } = desglosarPrecioConIvaIncluido(precioFinal, tarifa);
  return {
    codigoPrincipal: `DIG-${indiceUnoBasado}`,
    descripcion:     producto.nombre,
    cantidad:        1,
    precioUnitario:  base,
    descuento:       0,
    precioTotalSinImpuesto: base,
    impuestos: [{ codigo: "2", codigoPorcentaje, tarifa, baseImponible: base, valor: valorIva }],
    tipo:              "productoDigital",
    productoDigitalId: producto.id,
  };
}

// ─── Precondición dura de productos digitales ────────────────────────────────
// Un producto digital vinculado a la orden SIN precio utilizable (ni
// precioVenta ni precioVentaCatalogo) no puede convertirse en línea de
// factura — construirLineaProductoDigital() generaría una línea de $0 y
// importeTotal volvería a quedar corto, en silencio, que es justo el fallo
// que este trabajo arregla. Fail closed: se bloquea la pre-factura entera,
// mismo mecanismo que evaluarItemNoListo() usa para Shipping Items.
export type ProductoDigitalNoListo = { id: string; nombre: string; motivo: "SIN_PRECIO" };

export function evaluarProductoDigitalNoListo(
  producto: Pick<CuentaUnificadaProductoDigital, "id" | "nombre" | "precioVenta" | "precioVentaCatalogo">
): ProductoDigitalNoListo | null {
  if (!(resolverPrecioProductoDigital(producto) > 0)) {
    return { id: producto.id, nombre: producto.nombre, motivo: "SIN_PRECIO" };
  }
  return null;
}

// ─── Agrupar totalConImpuestos por tarifa ────────────────────────────────────
export function agruparTotalConImpuestos(detalles: DetalleFactura[]): TotalImpuesto[] {
  const ivaMap = new Map<string, { base: number; valor: number; tarifa: number }>();
  for (const d of detalles) {
    for (const imp of d.impuestos) {
      const prev = ivaMap.get(imp.codigoPorcentaje) ?? { base: 0, valor: 0, tarifa: imp.tarifa };
      ivaMap.set(imp.codigoPorcentaje, {
        base:   round2(prev.base + imp.baseImponible),
        valor:  round2(prev.valor + imp.valor),
        tarifa: imp.tarifa,
      });
    }
  }
  return [...ivaMap.entries()].map(([cp, v]) => ({
    codigo: "2", codigoPorcentaje: cp, baseImponible: v.base, tarifa: v.tarifa, valor: v.valor,
  }));
}

// ─── Precondición dura de items ──────────────────────────────────────────────
// Fase 17.b (inventario por cantidad): la puerta real ahora es el stock
// (`cantidad`), no la existencia de una factura previa. Con el modelo de
// cantidad, un registro puede representar varias unidades y venderse en
// partes: un item con factura previa PERO stock restante (cantidad >= 1)
// sigue siendo vendible. "YA_FACTURADO" se conserva como el motivo más
// informativo para el caso clásico (registro de 1 unidad ya vendido:
// factura previa + cantidad 0); sin factura previa, cantidad 0 reporta
// "SIN_STOCK".
export type ItemNoListo = { id: string; nombre: string; motivo: "NO_RESERVADO" | "YA_FACTURADO" | "SIN_STOCK" | "SIN_PRECIO_FINAL" };

export function evaluarItemNoListo(
  item: Pick<CuentaUnificadaItem, "id" | "nombre" | "precio">,
  detalle: Pick<ItemDetalleGancho, "reservado" | "tieneFacturaPrevia" | "cantidad" | "cantidadReservada"> | undefined
): ItemNoListo | null {
  if (!detalle) return null; // fetch inconsistente — se ignora en vez de bloquear (ver traductor.ts)
  if (detalle.cantidad < 1) {
    if (detalle.tieneFacturaPrevia) return { id: item.id, nombre: item.nombre, motivo: "YA_FACTURADO" };
    return { id: item.id, nombre: item.nombre, motivo: "SIN_STOCK" };
  }
  // F-42 — "apartado" ya no se lee solo de la bandera. En un registro
  // multiunidad, `reservado` únicamente se enciende cuando se agotan las
  // unidades libres; con 1 de 52 comprometidas la bandera es false pero el
  // artículo sí está apartado y debe poder facturarse. Basta con que haya
  // al menos una unidad comprometida, por cualquiera de las dos vías.
  const hayUnidadApartada = detalle.reservado || (detalle.cantidadReservada ?? 0) >= 1;
  if (!hayUnidadApartada) return { id: item.id, nombre: item.nombre, motivo: "NO_RESERVADO" };
  if (!(item.precio > 0)) return { id: item.id, nombre: item.nombre, motivo: "SIN_PRECIO_FINAL" };
  return null;
}

// ─── Formas de pago: abonos vigentes + saldo pendiente ───────────────────────
// Cada Pago sale marcado con origenPago ("abono" vs "saldo") y, para los que
// vienen de un abono, su fecha — puramente informativo para que
// FacturacionForm distinga visualmente "Abono registrado · <fecha>" de
// "Saldo por cobrar" (editable). No afecta el XML/RIDE.
export function calcularFormasPago(
  abonosVigentes: (Pick<CuentaUnificadaAbono, "metodoPago" | "monto"> & { fecha?: string | null })[],
  importeTotal: number
): Pago[] {
  const pagos: Pago[] = abonosVigentes.map((a) => ({
    formaPago: (a.metodoPago && MAPA_METODO_PAGO_SRI[a.metodoPago]) || FORMA_PAGO_FALLBACK,
    total:     round2(a.monto),
    origenPago: "abono",
    fechaAbono: a.fecha ?? undefined,
  }));

  const sumaAbonos     = round2(pagos.reduce((s, p) => s + p.total, 0));
  const saldoPendiente = round2(importeTotal - sumaAbonos);

  if (saldoPendiente > 0.01) {
    pagos.push({ formaPago: FORMA_PAGO_SALDO_DEFAULT, total: saldoPendiente, origenPago: "saldo" });
  } else if (saldoPendiente < -0.01) {
    // No debería pasar por construcción — ver comentario en traductor.ts.
    console.warn(
      `[gancho] Suma de abonos ($${sumaAbonos}) excede el total calculado ($${importeTotal}). Revisar manualmente.`
    );
  }
  if (pagos.length === 0) {
    pagos.push({ formaPago: FORMA_PAGO_SALDO_DEFAULT, total: importeTotal, origenPago: "saldo" });
  }
  return pagos;
}

import "server-only";

// Piezas puras del traductor cuentaUnificadaToDatosVenta() (gancho Fase 16
// PR2) — separadas de traductor.ts para poder testearlas sin mockear todo
// el árbol de fetches de getCuentaUnificada(). Ninguna función de aquí toca
// Airtable ni red.

import type { DetalleFactura, TotalImpuesto, Pago } from "../types/factura";
import type { CuentaUnificadaItem, CuentaUnificadaServicio, CuentaUnificadaAbono } from "@/types/cuenta-unificada";
import type { ItemDetalleGancho } from "./airtableGancho";
import {
  SERVICIO_IVA_DEFAULT, TARIFA_IVA_SRI, TARIFA_IVA_ITEM_DEFAULT,
  MAPA_METODO_PAGO_SRI, FORMA_PAGO_SALDO_DEFAULT, FORMA_PAGO_FALLBACK,
} from "./config";

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Desglosar un precio con IVA incluido ────────────────────────────────────
// Decisión de negocio confirmada: TODOS los precios de la cuenta unificada
// (repuestos y servicios — "Precio venta final" / costo de servicio) son
// precios finales CON IVA incluido, no bases. El SRI espera la base (sin
// impuestos) en precioUnitario/precioTotalSinImpuesto y el IVA aparte en
// <impuestos> — hay que desglosar hacia adentro, no sumar IVA encima.
//
// El IVA se calcula como el COMPLEMENTO de la base ya redondeada (precioFinal
// - base), no como base*tarifa/100 de forma independiente — así
// `base + valorIva` reconstruye EXACTO el precio final al centavo, sin
// importar la acumulación de redondeos de dividir por 1.15. Con tarifa 0
// (0%/Exento/No objeto) no hay nada que desglosar: el precio final YA es la
// base.
//
// Nota: esto es específico del gancho (precios de Shipping Items/Servicios,
// que sí son finales). El formulario manual de mostrador NO cambia — sigue
// tratando precioUnitario como base y sumando IVA encima, en
// FacturacionForm.tsx (calcularTotales/handleEmitir), código que esta
// función no toca.
export function desglosarPrecioConIvaIncluido(
  precioFinal: number,
  tarifa: number
): { base: number; valorIva: number } {
  if (tarifa === 0) {
    return { base: round2(precioFinal), valorIva: 0 };
  }
  const base = round2(precioFinal / (1 + tarifa / 100));
  const valorIva = round2(precioFinal - base);
  return { base, valorIva };
}

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
export type ItemNoListo = { id: string; nombre: string; motivo: "NO_RESERVADO" | "YA_FACTURADO" };

export function evaluarItemNoListo(
  item: Pick<CuentaUnificadaItem, "id" | "nombre">,
  detalle: Pick<ItemDetalleGancho, "reservado" | "tieneFacturaPrevia"> | undefined
): ItemNoListo | null {
  if (!detalle) return null; // fetch inconsistente — se ignora en vez de bloquear (ver traductor.ts)
  if (detalle.tieneFacturaPrevia) return { id: item.id, nombre: item.nombre, motivo: "YA_FACTURADO" };
  if (!detalle.reservado) return { id: item.id, nombre: item.nombre, motivo: "NO_RESERVADO" };
  return null;
}

// ─── Formas de pago: abonos vigentes + saldo pendiente ───────────────────────
export function calcularFormasPago(
  abonosVigentes: Pick<CuentaUnificadaAbono, "metodoPago" | "monto">[],
  importeTotal: number
): Pago[] {
  const pagos: Pago[] = abonosVigentes.map((a) => ({
    formaPago: (a.metodoPago && MAPA_METODO_PAGO_SRI[a.metodoPago]) || FORMA_PAGO_FALLBACK,
    total:     round2(a.monto),
  }));

  const sumaAbonos     = round2(pagos.reduce((s, p) => s + p.total, 0));
  const saldoPendiente = round2(importeTotal - sumaAbonos);

  if (saldoPendiente > 0.01) {
    pagos.push({ formaPago: FORMA_PAGO_SALDO_DEFAULT, total: saldoPendiente });
  } else if (saldoPendiente < -0.01) {
    // No debería pasar por construcción — ver comentario en traductor.ts.
    console.warn(
      `[gancho] Suma de abonos ($${sumaAbonos}) excede el total calculado ($${importeTotal}). Revisar manualmente.`
    );
  }
  if (pagos.length === 0) {
    pagos.push({ formaPago: FORMA_PAGO_SALDO_DEFAULT, total: importeTotal });
  }
  return pagos;
}

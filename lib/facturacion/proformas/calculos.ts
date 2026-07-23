// Cálculos puros de la proforma (sin server-only: la UI los usa para la vista
// previa de totales). Reutiliza el desglose de IVA incluido del resto del módulo.

import { desglosarPrecioConIvaIncluido, round2 } from "../ivaIncluido";
import type { LineaProforma } from "./types";

// Tarifas SRI por código.
const TARIFA_POR_CODIGO: Record<string, number> = { "4": 15, "3": 14, "8": 8, "5": 5, "2": 0, "1": 0, "0": 0 };

export function tarifaDeCodigo(codigo: string): number {
  return TARIFA_POR_CODIGO[codigo] ?? 15;
}

export type TotalesProforma = {
  totalSinImpuestos: number;
  totalDescuento:    number;
  iva:               number;
  importeTotal:      number;
  /** Desglose por tarifa para el PDF. */
  porTarifa: Array<{ codigo: string; tarifa: number; base: number; valor: number }>;
};

export function calcularTotalesProforma(lineas: LineaProforma[]): TotalesProforma {
  const porTarifaMap = new Map<string, { tarifa: number; base: number; valor: number }>();
  let totalDescuento = 0;

  for (const l of lineas) {
    const tarifa = tarifaDeCodigo(l.tarifaIva);
    const bruto  = round2(l.cantidad * l.precioUnitario);
    const desc   = round2(l.descuento);
    const neto   = round2(bruto - desc);
    totalDescuento = round2(totalDescuento + desc);
    const { base, valorIva } = desglosarPrecioConIvaIncluido(neto, tarifa);
    const prev = porTarifaMap.get(l.tarifaIva) ?? { tarifa, base: 0, valor: 0 };
    porTarifaMap.set(l.tarifaIva, {
      tarifa,
      base:  round2(prev.base + base),
      valor: round2(prev.valor + valorIva),
    });
  }

  const porTarifa = [...porTarifaMap.entries()].map(([codigo, v]) => ({ codigo, tarifa: v.tarifa, base: v.base, valor: v.valor }));
  const totalSinImpuestos = round2(porTarifa.reduce((s, t) => s + t.base, 0));
  const iva               = round2(porTarifa.reduce((s, t) => s + t.valor, 0));
  const importeTotal      = round2(totalSinImpuestos + iva);

  return { totalSinImpuestos, totalDescuento, iva, importeTotal, porTarifa };
}

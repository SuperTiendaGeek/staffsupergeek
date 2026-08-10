/**
 * Totales de una factura, calculados desde sus líneas.
 *
 * Sin "server-only": pantalla y servidor cuadran con la misma cuenta.
 *
 * ─── Por qué existe ──────────────────────────────────────────────────────────
 *
 * Al corregir y reenviar una factura, los totales NO se copian de lo que manda
 * el navegador: se recalculan aquí desde las líneas. Así el XML siempre cuadra
 * consigo mismo, aunque la pantalla mandara otra cosa — y el SRI rechaza sin
 * contemplaciones un comprobante cuyos totales no sumen.
 */

import type { DetalleFactura, TotalImpuesto } from "../types/factura";

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type TotalesFactura = {
  totalSinImpuestos: number;
  totalDescuento:    number;
  totalConImpuestos: TotalImpuesto[];
  importeTotal:      number;
};

export function totalesDesdeDetalles(detalles: DetalleFactura[]): TotalesFactura {
  // Se agrupa por tarifa (codigoPorcentaje), que es como lo espera el SRI:
  // una línea de <totalConImpuestos> por cada porcentaje distinto.
  const porTarifa = new Map<string, TotalImpuesto>();

  let totalSinImpuestos = 0;
  let totalDescuento    = 0;

  for (const d of detalles ?? []) {
    totalSinImpuestos += d.precioTotalSinImpuesto ?? 0;
    totalDescuento    += d.descuento ?? 0;

    for (const imp of d.impuestos ?? []) {
      const previo = porTarifa.get(imp.codigoPorcentaje);
      porTarifa.set(imp.codigoPorcentaje, {
        codigo:           imp.codigo,
        codigoPorcentaje: imp.codigoPorcentaje,
        baseImponible:    round2((previo?.baseImponible ?? 0) + (imp.baseImponible ?? 0)),
        valor:            round2((previo?.valor ?? 0) + (imp.valor ?? 0)),
        ...(imp.tarifa !== undefined ? { tarifa: imp.tarifa } : {}),
      });
    }
  }

  const totalConImpuestos = [...porTarifa.values()];
  const impuestos = totalConImpuestos.reduce((acc, t) => acc + t.valor, 0);

  return {
    totalSinImpuestos: round2(totalSinImpuestos),
    totalDescuento:    round2(totalDescuento),
    totalConImpuestos,
    importeTotal:      round2(round2(totalSinImpuestos) + round2(impuestos)),
  };
}

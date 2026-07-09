import "server-only";

import { FacturacionRechazoError } from "../errores";
import type { Pago } from "../types/factura";

// Tolerancia de un centavo para acumulación de redondeos entre líneas.
const TOLERANCIA = 0.01;

/**
 * La suma de las formas de pago debe cuadrar con el importe total. Hoy el
 * formulario manual siempre manda una sola forma de pago igual al total
 * (nunca falla), pero el gancho de Fase 16 arma varias líneas (abonos reales
 * + saldo pendiente) — este guard es la red de seguridad server-side para
 * ese caso, y para cualquier llamador futuro.
 */
export function assertPagosCuadranConTotal(pagos: Pago[], importeTotal: number): void {
  const suma = pagos.reduce((acc, p) => acc + p.total, 0);
  const diferencia = Math.round((suma - importeTotal) * 100) / 100;

  if (Math.abs(diferencia) > TOLERANCIA) {
    throw new FacturacionRechazoError(
      `La suma de las formas de pago ($${suma.toFixed(2)}) no coincide con el total de la factura ` +
      `($${importeTotal.toFixed(2)}).`
    );
  }
}

import "server-only";

import { FacturacionRechazoError } from "../errores";

// "07" = Consumidor Final (catálogo de tipos de identificación del SRI).
const TIPO_CONSUMIDOR_FINAL = "07";

/**
 * Aborta con FacturacionRechazoError si la venta es a Consumidor Final por
 * un monto igual o mayor al límite configurado — regla general del SRI que
 * exige identificar al cliente (cédula o RUC) sobre ese monto.
 *
 * Hoy este bloqueo también vive en la UI (FacturacionForm.tsx), pero un
 * request directo al API (o un futuro origen automático, p.ej. el gancho de
 * Fase 16) no pasa por esa UI — de ahí que la regla se aplique aquí también,
 * dentro de emitirFactura(), el único punto de entrada compartido por todos
 * los llamadores actuales y futuros.
 */
export function assertConsumidorFinalPermitido(
  tipoIdentificacionComprador: string,
  importeTotal: number,
  limite: number
): void {
  if (tipoIdentificacionComprador !== TIPO_CONSUMIDOR_FINAL) return;
  if (importeTotal < limite) return;

  throw new FacturacionRechazoError(
    `Consumidor Final no permite montos iguales o mayores a $${limite.toFixed(2)} ` +
    `(total: $${importeTotal.toFixed(2)}). Identifique al cliente (cédula o RUC).`
  );
}

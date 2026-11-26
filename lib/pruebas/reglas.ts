// Datos de prueba (auditoría ops, punto 16) — reglas PURAS, sin servidor.
//
// Una sola marca para todo el portal: la casilla «Es prueba» de Órdenes de
// Reparación, Operación Comercial y Clientes (creadas el 26-nov-2026). Es lo
// mismo que ya hacen las facturas y notas de crédito con su «Ambiente» y los
// pagos en línea con el suyo; y lo que hacen Shopify («test») y Odoo
// (archivar): no se borra, se marca y se excluye.
//
// Lo marcado:
//   · sale del tablero, la Lista (bandejas y conteos), las alertas, Cobros,
//     el tablero de pedidos, «Por comprar» y la historia del cliente real;
//     el buscador de la Lista sí lo encuentra, con la etiqueta «PRUEBA»;
//   · un abono registrado a mano no llega a Finanzas;
//   · en producción (SRI_AMBIENTE = 2) no se emite factura ni recibo;
//   · no aparta inventario real (repuestos ni licencias).
// Toda orden o pedido de un cliente de prueba (PRUEBA INTERNA) nace marcado.

export const CAMPO_ES_PRUEBA = "Es prueba";

/** Filtro de Airtable: deja fuera lo marcado (casilla vacía = no es prueba). */
export const FORMULA_SIN_PRUEBAS = `NOT({${CAMPO_ES_PRUEBA}})`;

export const ETIQUETA_PRUEBA = "PRUEBA";

export const MENSAJE_SIN_DOCUMENTO =
  "Es de prueba: en producción no se emiten facturas ni recibos. Usa la proforma.";
export const MENSAJE_SIN_INVENTARIO = "Es de prueba: no se aparta inventario real.";

/** ¿El registro (orden, pedido o cliente) está marcado como prueba? */
export function esPrueba(fields: Record<string, unknown> | null | undefined): boolean {
  return fields?.[CAMPO_ES_PRUEBA] === true;
}

/** Suma el filtro «sin pruebas» a una fórmula de Airtable (o lo deja solo). */
export function sinPruebas(formula: string | null | undefined): string {
  const f = (formula ?? "").trim();
  return f ? `AND(${f},${FORMULA_SIN_PRUEBAS})` : FORMULA_SIN_PRUEBAS;
}

/** Lo nuevo nace de prueba si su cliente o su origen (orden de la que sale) lo es. */
export function heredaPrueba(...origenes: Array<boolean | null | undefined>): boolean {
  return origenes.some((o) => o === true);
}

/**
 * ¿Se bloquea emitir un documento de venta? Solo en producción: en el
 * ambiente de pruebas del SRI la factura ya nace «PRUEBAS» y nunca llega a
 * Finanzas ni al inventario (lib/finanzas/puentes/facturacion.ts).
 */
export function bloqueaDocumento(origenEsPrueba: boolean, ambienteSri: string | null | undefined): boolean {
  return origenEsPrueba && (ambienteSri ?? "1").trim() === "2";
}

/** Una factura del ambiente de pruebas no cuenta como documento de una cuenta real. */
export function facturaCuentaComoDocumento(ambiente: unknown): boolean {
  const a = typeof ambiente === "string" ? ambiente : ambiente && typeof ambiente === "object" && "name" in ambiente ? String((ambiente as { name: unknown }).name ?? "") : "";
  return a.trim().toUpperCase() !== "PRUEBAS";
}

/**
 * ¿Una factura ya emitida impide emitir otra sobre la misma cuenta? En
 * producción, una factura del ambiente de PRUEBAS no cuenta (alguien probó en
 * local contra una orden real, caso OR000342); en local sí, para que la
 * prueba se comporte como la vida real.
 */
export function facturaBloqueaEnAmbiente(ambienteFactura: unknown, ambienteSri: string | null | undefined): boolean {
  return facturaCuentaComoDocumento(ambienteFactura) || (ambienteSri ?? "1").trim() !== "2";
}

/** Cuerpo de «Marcar como prueba / Quitar la marca» (solo administrador). */
export function revisarMarca(body: unknown): { ok: true; esPrueba: boolean } | { ok: false; error: string } {
  const v = body && typeof body === "object" ? (body as { esPrueba?: unknown }).esPrueba : undefined;
  if (typeof v !== "boolean") return { ok: false, error: "Falta indicar si es de prueba." };
  return { ok: true, esPrueba: v };
}

/** Lo que queda en la Actividad de la orden al marcar o desmarcar. */
export function textoActividadMarca(esPruebaNueva: boolean, quien: string): string {
  return esPruebaNueva
    ? `${quien} marcó esta orden como PRUEBA: sale de tableros y reportes, no va a Finanzas y no emite documentos en producción.`
    : `${quien} quitó la marca de prueba: la orden vuelve a contar como real.`;
}

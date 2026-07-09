import "server-only";

// Config del gancho Cuenta Unificada → Facturación (Fase 16 PR2).
// Constantes revisables — nada aquí toca el pipeline SRI existente.

// ─── IVA de servicios (Decisión #4 del diseño) ───────────────────────────────
// Los servicios (tabla Servicios, vía getCuentaUnificada) no tienen campo de
// tarifa de IVA propio — se les asigna esta constante. Editable en la
// pre-factura antes de emitir.
export const SERVICIO_IVA_DEFAULT = { codigoPorcentaje: "4", tarifa: 15 } as const;

// ─── IVA de productos (Shipping Items."Tarifa IVA") ──────────────────────────
// Mapeo 1:1 entre las 4 opciones reales del select "Tarifa IVA" (confirmado
// vía Airtable Metadata API: ["15%","0%","Exento","No objeto"]) y los
// códigos del catálogo SRI, reutilizando exactamente el mismo mapeo que ya
// usa FacturacionForm.tsx (TARIFAS_IVA) para las líneas manuales — mismo
// significado, mismos códigos, ya validado contra el XSD real.
export const TARIFA_IVA_SRI: Record<string, { codigoPorcentaje: string; tarifa: number }> = {
  "15%":       { codigoPorcentaje: "4", tarifa: 15 },
  "0%":        { codigoPorcentaje: "2", tarifa: 0 },
  "Exento":    { codigoPorcentaje: "1", tarifa: 0 },
  "No objeto": { codigoPorcentaje: "0", tarifa: 0 },
};

// Si un Shipping Item no tiene "Tarifa IVA" seteada (campo vacío — items
// creados antes de que existiera el campo), se asume 15% (Decisión #3).
export const TARIFA_IVA_ITEM_DEFAULT = TARIFA_IVA_SRI["15%"];

// ─── Formas de pago: Método de Pago (Abonos) → forma de pago SRI ────────────
// "Método de Pago" en Abonos es un singleSelect real (confirmado vía
// Airtable Metadata API el 2026-07-xx): exactamente estos 7 valores, ni uno
// más — no inventar variantes.
//
// Catálogo SRI de formas de pago (Ficha Técnica, Tabla 22) usado aquí:
//   01 = sin utilización del sistema financiero (efectivo)
//   16 = tarjeta de débito
//   17 = dinero electrónico (sistema específico del BCE — NO cualquier
//        billetera electrónica; no aplica a PayPal/PayPhone)
//   19 = tarjeta de crédito
//   20 = otros con utilización del sistema financiero
//
// ⚠️ REVISAR ANTES DE EMITIR EN CELCER REAL — dos mapeos son una asunción,
// no un hecho derivable del dato disponible:
//   - "Tarjeta": Abonos NO distingue débito (16) de crédito (19). Se asume
//     crédito (19, más común en el negocio) — si la mayoría de tarjetas
//     reales son débito, cambiar a "16" o (mejor, en una fase futura)
//     agregar esa distinción en Abonos.
//   - "Otro": mapeo conservador a 20 (con sistema financiero). Si en la
//     práctica "Otro" se usa a veces para efectivo disfrazado, podría
//     necesitar revisión caso por caso.
export const MAPA_METODO_PAGO_SRI: Record<string, string> = {
  "Efectivo":      "01",
  "Transferencia": "20", // transferencia bancaria = "con utilización del sistema financiero"
  "Tarjeta":       "19", // ⚠️ asumido crédito — ver nota arriba
  "Depósito":      "20", // depósito bancario = "con utilización del sistema financiero"
  "PayPal":        "20", // ⚠️ no es "17 dinero electrónico" (ese es el sistema específico del BCE)
  "PayPhone":      "20", // ⚠️ ídem PayPal — procesador privado, no el dinero electrónico del BCE
  "Otro":          "20", // ⚠️ conservador, revisar caso por caso
};

// Forma de pago para la línea de saldo pendiente que agrega la pre-factura
// cuando totalCuenta > totalAbonado (Decisión #4.4 del diseño). Editable en
// el formulario antes de emitir.
export const FORMA_PAGO_SALDO_DEFAULT = "01";

// Método de pago sin mapeo conocido (no debería pasar con los 7 valores
// reales de arriba, pero si Abonos agrega una opción nueva en el futuro,
// cae aquí en vez de romper la pre-factura).
export const FORMA_PAGO_FALLBACK = "01";

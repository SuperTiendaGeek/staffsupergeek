// Reglas de distribución de costos logísticos de un packing (flete, arancel y
// otros) entre sus artículos. Puro y testeable.
//
// ─── Por qué existe este archivo ─────────────────────────────────────────────
//
// El reparto NO se calcula aquí: lo hacen tres fórmulas de Airtable en Shipping
// Items ("Costo flete asignado", "Costo arancel asignado", "Otros costos
// asignados"). Cada una decide leyendo el nombre de la regla del packing:
//
//     IF(FIND("cantidad", LOWER(regla)),  <reparto por cantidad>,
//     IF(FIND("costo",    LOWER(regla)),  <reparto por costo>,  0))
//
// Es decir: solo reconoce las reglas cuyo nombre contiene "cantidad" o "costo".
// El select del packing ofrece cinco opciones:
//
//     "Por costo del item"  → contiene "costo"     → FUNCIONA
//     "Por cantidad"        → contiene "cantidad"  → FUNCIONA
//     "Por peso"            → no contiene ninguna  → reparte $0, SIN AVISAR
//     "Manual"              → no contiene ninguna  → reparte $0
//     "No definida"         → no contiene ninguna  → reparte $0
//
// "Manual" y "No definida" en cero son correctos: nadie espera un reparto
// automático. "Por peso" no: parece una regla de negocio válida (el flete
// internacional suele cobrarse por peso) pero está a medio construir. Elegirla
// deja el flete completo del packing sin repartir entre los artículos, y nada
// lo indica en pantalla.
//
// Mientras "Por peso" no esté implementada en las fórmulas, la aplicación no
// deja elegirla. Es preferible un error claro al guardar que un costo en cero
// que nadie nota. Los 7 packings actuales usan "Por costo del item".

/** Reglas que las fórmulas de Airtable sí saben repartir. */
export const REGLAS_DISTRIBUCION_AUTOMATICA = ["Por costo del item", "Por cantidad"] as const;

/** Reglas válidas que a propósito no reparten nada. */
export const REGLAS_DISTRIBUCION_SIN_REPARTO = ["Manual", "No definida"] as const;

/**
 * Reglas presentes en el select de Airtable pero que las fórmulas todavía no
 * saben calcular. Elegirlas dejaría el costo en cero sin avisar.
 */
export const REGLAS_DISTRIBUCION_NO_IMPLEMENTADAS = ["Por peso"] as const;

export type ReglaDistribucion =
  | (typeof REGLAS_DISTRIBUCION_AUTOMATICA)[number]
  | (typeof REGLAS_DISTRIBUCION_SIN_REPARTO)[number]
  | (typeof REGLAS_DISTRIBUCION_NO_IMPLEMENTADAS)[number];

function normalizar(valor?: string | null): string {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** ¿Esta regla reparte automáticamente el costo entre los artículos? */
export function reglaReparteAutomaticamente(regla?: string | null): boolean {
  const r = normalizar(regla);
  return REGLAS_DISTRIBUCION_AUTOMATICA.some((v) => normalizar(v) === r);
}

/**
 * Valida la regla elegida para un packing.
 * Devuelve el mensaje de error, o null si se puede usar.
 */
export function validarReglaDistribucion(regla?: string | null): string | null {
  const r = normalizar(regla);
  if (!r) return null; // sin regla: el packing todavía no define reparto

  if (REGLAS_DISTRIBUCION_NO_IMPLEMENTADAS.some((v) => normalizar(v) === r)) {
    return (
      'La regla "Por peso" todavía no reparte costos: dejaría el flete y el arancel en $0 ' +
      "para todos los artículos del packing. Usa \"Por costo del item\" o \"Por cantidad\"."
    );
  }

  const conocidas = [
    ...REGLAS_DISTRIBUCION_AUTOMATICA,
    ...REGLAS_DISTRIBUCION_SIN_REPARTO,
    ...REGLAS_DISTRIBUCION_NO_IMPLEMENTADAS,
  ];
  if (!conocidas.some((v) => normalizar(v) === r)) {
    return `"${regla}" no es una regla de distribución conocida.`;
  }

  return null;
}

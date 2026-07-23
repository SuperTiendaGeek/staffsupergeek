// Control de fechas de la anulación (Fase 18 PR5). Sin server-only: la UI las
// usa para mostrar el plazo y los días restantes.
//
// Regla SRI 2026: una factura se puede anular hasta el DÍA 7 DEL MES SIGUIENTE
// al de emisión. Si ese día 7 cae en fin de semana, se corre al siguiente día
// hábil (lunes). Los feriados nacionales NO se calculan aquí — si el 7 cae en
// feriado, el usuario debe verificar el último día hábil real en el portal SRI.

/** Día 7 del mes siguiente al de la fecha de emisión, corrido a lunes si cae
 *  sábado o domingo. Devuelve la fecha (a medianoche, hora local). */
export function fechaLimiteAnulacion(fechaEmision: Date): Date {
  const anio = fechaEmision.getFullYear();
  const mes  = fechaEmision.getMonth(); // 0-based
  // Día 7 del mes siguiente (getMonth+1 puede desbordar a enero del año siguiente; Date lo maneja).
  const limite = new Date(anio, mes + 1, 7, 0, 0, 0, 0);
  const dia = limite.getDay();
  if (dia === 6) limite.setDate(limite.getDate() + 2); // sábado → lunes
  else if (dia === 0) limite.setDate(limite.getDate() + 1); // domingo → lunes
  return limite;
}

/** Días calendario que faltan para el plazo (negativo si ya pasó). Compara solo
 *  fechas (sin hora). */
export function diasRestantesAnulacion(fechaEmision: Date, hoy: Date): number {
  const limite = fechaLimiteAnulacion(fechaEmision);
  const a = new Date(limite.getFullYear(), limite.getMonth(), limite.getDate());
  const b = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000));
}

/** ¿Todavía se puede anular hoy? (hoy <= día límite). */
export function dentroDelPlazoAnulacion(fechaEmision: Date, hoy: Date): boolean {
  return diasRestantesAnulacion(fechaEmision, hoy) >= 0;
}

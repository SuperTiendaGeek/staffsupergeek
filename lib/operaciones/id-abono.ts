// Numeración de la tabla "Abonos". Parte pura, testeable.
//
// El "ID Abono" no es un autoNumber de Airtable: es un campo numérico que el
// código llena leyendo el máximo actual y sumando 1. Tres módulos distintos
// crean abonos contra la misma tabla —técnicos (abono de una orden),
// operaciones (abono de una cotización) y facturación (abono de una reserva)—
// así que dos cobros simultáneos pueden leer el mismo máximo y escribir el
// mismo número.
//
// Con el volumen actual (unos 160 abonos en tres meses) la colisión es
// improbable, pero el daño sería silencioso: dos abonos distintos con el mismo
// número, y cualquier búsqueda o conciliación por ese número devolvería el par.
// Por eso el candidato se verifica contra los números ya ocupados antes de
// escribirlo.

/**
 * Primer número libre a partir del máximo conocido.
 *
 * `ocupados` son los IDs que ya existen; se salta los que estén tomados en vez
 * de confiar ciegamente en máximo + 1.
 */
export function elegirSiguienteIdAbono(maximoActual: number, ocupados: Iterable<number> = []): number {
  const tomados = new Set<number>();
  for (const id of ocupados) {
    if (Number.isFinite(id)) tomados.add(Math.trunc(id));
  }

  const base = Number.isFinite(maximoActual) && maximoActual > 0 ? Math.trunc(maximoActual) : 0;
  let candidato = base + 1;
  // Cota defensiva: si algo va muy mal, no entrar en bucle infinito.
  for (let i = 0; i < 1000 && tomados.has(candidato); i++) candidato++;
  return candidato;
}

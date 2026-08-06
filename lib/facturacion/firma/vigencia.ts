/**
 * Vigencia de la firma electrónica: cuántos días le quedan y con qué urgencia
 * hay que avisar.
 *
 * Sin "server-only" a propósito: la pantalla de facturación también necesita
 * estos cálculos para pintar el semáforo, igual que hace `ivaIncluido.ts` y
 * `notaCredito/calculos.ts`. Son funciones puras — sin red, sin Airtable, sin
 * variables de entorno — para poder probarlas sin montar nada.
 *
 * Contexto: el 4-ago-2026 se descubrió, leyendo el archivo a mano, que la
 * firma vencía en 29 días. Nadie avisaba. Este módulo es la base para que eso
 * no vuelva a pasar.
 */

export type NivelVigencia =
  | "vigente"     // más de 60 días — no molestar
  | "por-vencer"  // 31 a 60 días — aviso tranquilo, hay tiempo de sobra
  | "critica"     // 0 a 30 días — aviso rojo, hay que actuar
  | "vencida";    // ya pasó — no se puede firmar nada

/** Umbrales en días. Un solo lugar donde cambiarlos. */
export const UMBRAL_POR_VENCER = 60;
export const UMBRAL_CRITICO    = 30;

/** Días en los que se envía notificación al administrador. */
export const DIAS_DE_AVISO = [60, 30, 15, 7, 1] as const;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** Fecha a medianoche local, para comparar días completos y no horas sueltas. */
function aMedianoche(f: Date): number {
  return new Date(f.getFullYear(), f.getMonth(), f.getDate()).getTime();
}

/**
 * Días calendario que faltan para que venza. Cero = vence hoy (todavía sirve).
 * Negativo = ya venció.
 */
export function diasRestantes(validoHasta: Date, ahora: Date): number {
  return Math.round((aMedianoche(validoHasta) - aMedianoche(ahora)) / MS_POR_DIA);
}

export function nivelVigencia(validoHasta: Date, ahora: Date): NivelVigencia {
  const dias = diasRestantes(validoHasta, ahora);
  if (dias < 0)                    return "vencida";
  if (dias <= UMBRAL_CRITICO)      return "critica";
  if (dias <= UMBRAL_POR_VENCER)   return "por-vencer";
  return "vigente";
}

/** ¿Hay que mostrar el aviso en pantalla? (todo lo que no sea "vigente"). */
export function requiereAviso(validoHasta: Date, ahora: Date): boolean {
  return nivelVigencia(validoHasta, ahora) !== "vigente";
}

/** ¿Toca mandar notificación hoy? Solo en los días exactos de la lista. */
export function tocaNotificar(validoHasta: Date, ahora: Date): boolean {
  const dias = diasRestantes(validoHasta, ahora);
  return (DIAS_DE_AVISO as readonly number[]).includes(dias);
}

function formatearFecha(f: Date): string {
  return f.toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" });
}

/** Texto listo para mostrar al usuario. Sin tecnicismos, con la acción incluida. */
export function mensajeVigencia(validoHasta: Date, ahora: Date): string {
  const dias  = diasRestantes(validoHasta, ahora);
  const fecha = formatearFecha(validoHasta);

  switch (nivelVigencia(validoHasta, ahora)) {
    case "vencida":
      return `Tu firma electrónica venció el ${fecha}. No se pueden emitir facturas ni notas de crédito ` +
             `hasta cargar una firma vigente en Facturación → Firma electrónica.`;
    case "critica":
      return dias === 0
        ? `Tu firma electrónica vence HOY (${fecha}). Renuévala y cárgala en Facturación → Firma electrónica.`
        : `Tu firma electrónica vence el ${fecha} (${dias} ${dias === 1 ? "día" : "días"}). ` +
          `Renuévala y cárgala en Facturación → Firma electrónica.`;
    case "por-vencer":
      return `Tu firma electrónica vence el ${fecha} (${dias} días). Conviene ir gestionando la renovación.`;
    case "vigente":
      return `Firma electrónica vigente hasta el ${fecha}.`;
  }
}

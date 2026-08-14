/**
 * Caducidad del crédito de una nota de crédito.
 *
 * Reglas puras: sin red, sin Airtable, sin reloj propio (la fecha de "hoy"
 * siempre se recibe como parámetro, para poder probarlo).
 *
 * ─── La regla ────────────────────────────────────────────────────────────────
 *
 * Una nota de crédito no devuelve efectivo: deja un crédito interno que el
 * cliente consume en una factura de reemplazo. Ese crédito vence a los SEIS
 * MESES de la fecha de autorización. Lo que quede sin usar deja de ser una
 * deuda con el cliente y pasa a ser ingreso del período en que caduca.
 *
 * Es una regla comercial de SUPER GEEK (decisión de Alex, julio de 2026), NO
 * una regla del SRI. La resolución NAC-DGERCGC25-00000017 eliminó el tope de
 * 12 meses para emitir notas de crédito; eso es otra cosa y no se toca aquí.
 *
 * Ver docs/DISENO_NC_REVERSA_Y_CADUCIDAD.md.
 */

export const MESES_DE_VIGENCIA = 6;

/** Los tres estados posibles del crédito, tal como están en Airtable. */
export type EstadoCredito = "Vigente" | "Consumido" | "Caducado";

export const ESTADOS_CREDITO: readonly EstadoCredito[] = ["Vigente", "Consumido", "Caducado"];

// ─── Fechas ──────────────────────────────────────────────────────────────────

/** "2026-08-14T12:27:21-05:00" o "2026-08-14" → { anio, mes, dia } */
function partesDeFecha(iso: string): { anio: number; mes: number; dia: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return null;
  return { anio: Number(m[1]), mes: Number(m[2]), dia: Number(m[3]) };
}

function diasDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

/**
 * Fecha de caducidad = autorización + 6 meses, en formato "aaaa-mm-dd".
 *
 * Se hace con aritmética de calendario y no sumando 180 días, porque el
 * cliente entiende "seis meses", no "medio año aproximado".
 *
 * El día se recorta cuando el mes destino es más corto: una NC autorizada el
 * 31 de agosto caduca el 28 de febrero (o el 29 si el año es bisiesto), no el
 * 3 de marzo. Sumar meses a secas con Date() se desborda al mes siguiente y
 * regalaría días de crédito.
 *
 * Devuelve "" si la fecha de entrada no es legible — el llamador decide qué
 * hacer, pero nunca se inventa una fecha.
 */
export function fechaDeCaducidad(fechaAutorizacion: string, meses = MESES_DE_VIGENCIA): string {
  const p = partesDeFecha(fechaAutorizacion ?? "");
  if (!p) return "";

  const totalMeses = p.mes - 1 + meses;
  const anio = p.anio + Math.floor(totalMeses / 12);
  const mes  = (totalMeses % 12) + 1;
  const dia  = Math.min(p.dia, diasDelMes(anio, mes));

  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/**
 * ¿Ya pasó la fecha de caducidad?
 *
 * El día de la caducidad TODAVÍA se puede usar el crédito: se compara con "<",
 * no con "<=". Si caduca el 14 de febrero, el 14 de febrero aún vale y el 15 ya
 * no. Ante la duda, a favor del cliente.
 */
export function yaVencio(fechaCaducidad: string, hoy: string): boolean {
  const c = partesDeFecha(fechaCaducidad ?? "");
  const h = partesDeFecha(hoy ?? "");
  if (!c || !h) return false;   // sin fecha legible no se caduca nada
  return `${h.anio}-${String(h.mes).padStart(2, "0")}-${String(h.dia).padStart(2, "0")}`
       > `${c.anio}-${String(c.mes).padStart(2, "0")}-${String(c.dia).padStart(2, "0")}`;
}

// ─── Estado del crédito ──────────────────────────────────────────────────────

export type NotaCreditoParaCaducidad = {
  estado:           string;   // estado ante el SRI
  saldoDisponible:  number;
  fechaCaducidad:   string;
  estadoCredito?:   string;   // lo ya guardado en Airtable, si hay
};

/**
 * Qué estado le corresponde HOY al crédito de esta nota.
 *
 * El orden de las preguntas importa:
 *
 *  1. Si ya está marcada "Caducado", se queda así. Caducar es definitivo: el
 *     asiento contable ya se hizo y no se deshace solo porque alguien edite el
 *     saldo a mano en Airtable.
 *  2. Sin saldo → "Consumido". El cliente lo usó; no hay nada que caducar.
 *  3. Con saldo y fecha pasada → "Caducado".
 *  4. Lo demás → "Vigente".
 *
 * Una nota que el SRI no autorizó nunca tuvo crédito, así que tampoco caduca.
 */
export function estadoCredito(nc: NotaCreditoParaCaducidad, hoy: string): EstadoCredito {
  if (nc.estadoCredito === "Caducado") return "Caducado";
  if (nc.estado !== "AUTORIZADO")      return "Vigente";
  if (!(nc.saldoDisponible > 0))       return "Consumido";
  if (yaVencio(nc.fechaCaducidad, hoy)) return "Caducado";
  return "Vigente";
}

/**
 * ¿Hay que crear el asiento de caducidad para esta nota?
 *
 * Distinto de estadoCredito(): aquí se decide si hay trabajo pendiente. Una
 * nota que YA tiene su movimiento de caducidad enlazado no se vuelve a tocar
 * por más veces que se pulse el botón — el proceso tiene que poder correrse
 * dos veces seguidas sin duplicar ingresos.
 */
export function debeCaducar(
  nc: NotaCreditoParaCaducidad & { movimientoCaducidadIds?: string[] },
  hoy: string
): boolean {
  if ((nc.movimientoCaducidadIds ?? []).length > 0) return false;
  if (nc.estado !== "AUTORIZADO")                   return false;
  if (!(nc.saldoDisponible > 0))                    return false;
  return yaVencio(nc.fechaCaducidad, hoy);
}

/** Los días que le quedan al crédito. Negativo si ya venció. */
export function diasParaCaducar(fechaCaducidad: string, hoy: string): number | null {
  const c = partesDeFecha(fechaCaducidad ?? "");
  const h = partesDeFecha(hoy ?? "");
  if (!c || !h) return null;
  const ms = Date.UTC(c.anio, c.mes - 1, c.dia) - Date.UTC(h.anio, h.mes - 1, h.dia);
  return Math.round(ms / 86_400_000);
}

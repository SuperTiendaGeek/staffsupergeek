/**
 * Historial de intentos de autorización de un comprobante.
 *
 * Sin "server-only": la pantalla lo muestra tal cual. Funciones puras.
 *
 * ─── Por qué ─────────────────────────────────────────────────────────────────
 *
 * Hasta ahora, cada respuesta del SRI SOBREESCRIBÍA la anterior en el campo
 * "Mensajes SRI". Si una factura fallaba dos veces por motivos distintos, el
 * primer motivo desaparecía — y con él la única pista de qué había pasado.
 *
 * Una misma factura puede enviarse varias veces antes de autorizarse. Ese
 * recorrido es lo que hace falta para auditar, dar soporte y detectar errores
 * que se repiten.
 *
 * ─── Por qué en el mismo campo y no en una tabla nueva ───────────────────────
 *
 * Se acumula como texto en "Mensajes SRI", con fecha y separador. No requiere
 * tocar el esquema de Airtable (donde los campos se crean a mano) y cubre lo
 * que se necesita: quién, cuándo, qué respondió el SRI y qué se cambió.
 *
 * Si algún día hace falta una tabla propia de intentos, este formato es
 * parseable y se migra sin perder nada.
 */

export type IntentoRegistrado = {
  fecha: Date;
  /** AUTORIZADO · DEVUELTA · NO AUTORIZADO · EN PROCESAMIENTO … */
  estado: string;
  /** Mensajes del SRI, ya formateados en una línea cada uno. */
  mensajes?: string[];
  /** Qué se corrigió antes de este intento, si se corrigió algo. */
  cambios?: string[];
  /** Quién lo hizo. */
  usuario?: string;
  /** Número de autorización, cuando el intento termina bien. */
  numeroAutorizacion?: string;
};

/** Marca que separa cada intento. Fija y reconocible, para poder parsear después. */
export const SEPARADOR = "───";

function fechaCorta(f: Date): string {
  const dd = String(f.getDate()).padStart(2, "0");
  const mm = String(f.getMonth() + 1).padStart(2, "0");
  const hh = String(f.getHours()).padStart(2, "0");
  const mi = String(f.getMinutes()).padStart(2, "0");
  return `${dd}/${mm} ${hh}:${mi}`;
}

/** Convierte un intento en el bloque de texto que se guarda. */
export function formatearIntento(intento: IntentoRegistrado, numero: number): string {
  const lineas: string[] = [];

  lineas.push(`${SEPARADOR} Intento ${numero} · ${fechaCorta(intento.fecha)} · ${intento.estado}`);

  if (intento.usuario?.trim()) lineas.push(`Por: ${intento.usuario.trim()}`);

  if (intento.cambios?.length) {
    lineas.push("Se corrigió:");
    for (const c of intento.cambios) lineas.push(`  · ${c}`);
  }

  if (intento.numeroAutorizacion) lineas.push(`Autorización: ${intento.numeroAutorizacion}`);

  for (const m of intento.mensajes ?? []) lineas.push(m);

  return lineas.join("\n");
}

/** Cuántos intentos hay ya registrados en el texto acumulado. */
export function contarIntentos(historialPrevio: string): number {
  if (!historialPrevio?.trim()) return 0;
  const encontrados = historialPrevio.match(new RegExp(`^${SEPARADOR} Intento `, "gm"));
  return encontrados ? encontrados.length : 0;
}

/**
 * Agrega un intento al historial, sin borrar lo anterior.
 *
 * Si el texto previo no tiene formato de historial (facturas viejas, donde el
 * campo guardaba solo el último mensaje suelto), se conserva igual como
 * "Intento 1" para no perder ese dato.
 */
export function agregarIntento(historialPrevio: string, intento: IntentoRegistrado): string {
  const previo = (historialPrevio ?? "").trim();
  const yaRegistrados = contarIntentos(previo);

  // Texto suelto de una factura anterior a este formato: se preserva.
  if (previo && yaRegistrados === 0) {
    const heredado = `${SEPARADOR} Intento 1 · (anterior al registro de intentos)\n${previo}`;
    return `${heredado}\n\n${formatearIntento(intento, 2)}`;
  }

  const bloque = formatearIntento(intento, yaRegistrados + 1);
  return previo ? `${previo}\n\n${bloque}` : bloque;
}

/**
 * Recorta el historial si se pasa del límite del campo, conservando SIEMPRE
 * los intentos más recientes — que son los que explican el estado actual.
 * El límite de un campo de texto largo en Airtable son 100.000 caracteres.
 */
export function recortarSiHaceFalta(historial: string, maximo = 90_000): string {
  if (historial.length <= maximo) return historial;

  const aviso = "(se recortaron los intentos más antiguos por espacio)\n\n";
  const cola  = historial.slice(historial.length - (maximo - aviso.length));
  // Empezar en un límite de intento, no a mitad de una línea.
  const corte = cola.indexOf(`${SEPARADOR} Intento `);
  return aviso + (corte >= 0 ? cola.slice(corte) : cola);
}

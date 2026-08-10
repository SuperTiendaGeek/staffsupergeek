/**
 * Identificación del comprador: tipos del SRI y validación real.
 *
 * Sin "server-only": la pantalla valida mientras se escribe y el servidor
 * vuelve a validar antes de emitir. Funciones puras, sin red.
 *
 * ─── El accidente que originó este módulo (2026-08-08) ───────────────────────
 *
 * Se emitió la factura 001-002-000000689 a "CUMOS LIAS" con identificación
 * 893849324 — nueve dígitos, que no son una cédula ecuatoriana. El SRI la
 * autorizó.
 *
 * ¿Por qué? Porque el tipo de identificación se ADIVINABA por la longitud:
 *
 *     13 dígitos → RUC
 *     10 dígitos → cédula
 *     cualquier otra cosa → PASAPORTE
 *
 * Nueve dígitos caían en "cualquier otra cosa", así que el sistema marcó el
 * comprobante como emitido a un extranjero con pasaporte, sin preguntar y sin
 * avisar. El SRI no valida documentos extranjeros, así que lo aceptó.
 *
 * Un dedazo —escribir 9 dígitos en vez de 10— se convertía en una factura a
 * una persona que no existe.
 *
 * De ahí las dos reglas de este módulo:
 *
 *   1. El tipo se ELIGE, nunca se adivina. `inferirTipoSugerido()` solo
 *      propone para ahorrar clics, y ante la duda no propone nada.
 *   2. Pasaporte e identificación del exterior solo valen si alguien los eligió
 *      a conciencia. Nunca son el destino por defecto de un dato que no cuadra.
 *
 * ─── Cómo se valida una cédula sin internet ──────────────────────────────────
 *
 * La cédula ecuatoriana lleva su propio dígito verificador: los primeros nueve
 * dígitos determinan matemáticamente el décimo (algoritmo módulo 10). El RUC
 * hace lo mismo con módulo 10 u 11 según el tipo de contribuyente. No hace
 * falta consultar al Registro Civil ni al SRI — es aritmética.
 */

import { FacturacionRechazoError } from "../errores";

// ─── Catálogo del SRI (Tabla 6 de la Ficha Técnica) ──────────────────────────

export type TipoIdentificacion = "04" | "05" | "06" | "07" | "08";

export const TIPOS_IDENTIFICACION: Array<{
  codigo: TipoIdentificacion;
  etiqueta: string;
  /** Valor exacto del single select en Airtable. No cambiar sin cambiarlo allá. */
  airtable: string;
}> = [
  { codigo: "05", etiqueta: "Cédula",                      airtable: "05 · Cédula" },
  { codigo: "04", etiqueta: "RUC",                         airtable: "04 · RUC" },
  { codigo: "06", etiqueta: "Pasaporte",                   airtable: "06 · Pasaporte" },
  { codigo: "08", etiqueta: "Identificación del exterior", airtable: "08 · Identificación del exterior" },
  { codigo: "07", etiqueta: "Consumidor final",            airtable: "07 · Consumidor final" },
];

export const IDENTIFICACION_CONSUMIDOR_FINAL = "9999999999999";

export function etiquetaAirtable(codigo: string): string | undefined {
  return TIPOS_IDENTIFICACION.find((t) => t.codigo === codigo)?.airtable;
}

/** De "05 · Cédula" a "05". Tolera que Airtable devuelva solo el código. */
export function codigoDesdeAirtable(valor: string | undefined): TipoIdentificacion | undefined {
  const v = (valor ?? "").trim();
  if (!v) return undefined;
  const porEtiqueta = TIPOS_IDENTIFICACION.find((t) => t.airtable === v);
  if (porEtiqueta) return porEtiqueta.codigo;
  const codigo = v.slice(0, 2);
  return TIPOS_IDENTIFICACION.some((t) => t.codigo === codigo)
    ? (codigo as TipoIdentificacion)
    : undefined;
}

export function esTipoValido(codigo: string): codigo is TipoIdentificacion {
  return TIPOS_IDENTIFICACION.some((t) => t.codigo === codigo);
}

// ─── Cédula: módulo 10 ───────────────────────────────────────────────────────

const PROVINCIAS_VALIDAS = new Set([
  ...Array.from({ length: 24 }, (_, i) => i + 1), // 01 a 24
  30,                                             // registrados en el exterior
]);

export function validarCedula(valor: string): boolean {
  const v = (valor ?? "").trim();
  if (!/^\d{10}$/.test(v)) return false;

  const provincia = parseInt(v.slice(0, 2), 10);
  if (!PROVINCIAS_VALIDAS.has(provincia)) return false;

  // El tercer dígito de una cédula de persona natural va de 0 a 5.
  if (parseInt(v[2], 10) > 5) return false;

  const coeficientes = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  const suma = coeficientes.reduce((acc, coef, i) => {
    const producto = parseInt(v[i], 10) * coef;
    return acc + (producto >= 10 ? producto - 9 : producto);
  }, 0);

  const verificador = (10 - (suma % 10)) % 10;
  return verificador === parseInt(v[9], 10);
}

// ─── RUC: depende del tipo de contribuyente ──────────────────────────────────

function digitoModulo11(digitos: string, coeficientes: number[]): number {
  const suma = coeficientes.reduce((acc, coef, i) => acc + parseInt(digitos[i], 10) * coef, 0);
  const residuo = suma % 11;
  return residuo === 0 ? 0 : 11 - residuo;
}

/**
 * Valida un RUC de 13 dígitos según el tipo de contribuyente, que lo marca el
 * TERCER dígito:
 *
 *   0-5 → persona natural  · los 10 primeros son una cédula válida
 *   6   → sector público   · módulo 11, verificador en la posición 9
 *   9   → sociedad privada · módulo 11, verificador en la posición 10
 *
 * Antes esto solo comprobaba que hubiera 13 dígitos, así que cualquier número
 * inventado de esa longitud pasaba.
 */
export function validarRuc(valor: string): boolean {
  const v = (valor ?? "").trim();
  if (!/^\d{13}$/.test(v)) return false;

  const provincia = parseInt(v.slice(0, 2), 10);
  if (!PROVINCIAS_VALIDAS.has(provincia)) return false;

  // Los tres últimos dígitos son el establecimiento: 000 no existe.
  if (v.slice(10) === "000") return false;

  const tercero = parseInt(v[2], 10);

  if (tercero <= 5) {
    // Persona natural: el RUC es su cédula + el código de establecimiento.
    return validarCedula(v.slice(0, 10));
  }

  if (tercero === 6) {
    // Sector público: verificador en la posición 9 (índice 8).
    const esperado = digitoModulo11(v.slice(0, 8), [3, 2, 7, 6, 5, 4, 3, 2]);
    return esperado === parseInt(v[8], 10);
  }

  if (tercero === 9) {
    // Sociedad privada / extranjera: verificador en la posición 10 (índice 9).
    const esperado = digitoModulo11(v.slice(0, 9), [4, 3, 2, 7, 6, 5, 4, 3, 2]);
    return esperado === parseInt(v[9], 10);
  }

  // 7 y 8 no corresponden a ningún tipo de contribuyente.
  return false;
}

// ─── Validación completa ─────────────────────────────────────────────────────

/**
 * Devuelve null si la identificación es válida para ese tipo, o el mensaje del
 * problema.
 *
 * Fail closed: un tipo vacío o desconocido NO se deja pasar. Antes, un valor
 * que no cuadraba terminaba en "pasaporte" sin que nadie lo eligiera; ahora
 * bloquea y obliga a decidir.
 */
export function validarIdentificacion(tipo: string | undefined, identificacion: string): string | null {
  const codigo = (tipo ?? "").trim();
  const valor  = (identificacion ?? "").trim();

  if (!codigo) {
    return "Elige el tipo de identificación (cédula, RUC, pasaporte…).";
  }
  if (!esTipoValido(codigo)) {
    return `Tipo de identificación desconocido: "${codigo}".`;
  }

  if (codigo === "07") {
    if (valor && valor !== IDENTIFICACION_CONSUMIDOR_FINAL) {
      return `Consumidor final debe ir con la identificación ${IDENTIFICACION_CONSUMIDOR_FINAL}.`;
    }
    return null;
  }

  if (!valor) return "Falta la identificación del cliente.";

  if (codigo === "05") {
    if (!/^\d{10}$/.test(valor)) {
      return `Una cédula tiene 10 dígitos; esta tiene ${valor.replace(/\D/g, "").length}. ` +
             "Si es un documento extranjero, elige 'Pasaporte' o 'Identificación del exterior'.";
    }
    if (!validarCedula(valor)) {
      return "Esa cédula no es válida: el dígito verificador no cuadra. Revisa que no falte ni sobre un número.";
    }
    return null;
  }

  if (codigo === "04") {
    if (!/^\d{13}$/.test(valor)) {
      return `Un RUC tiene 13 dígitos; este tiene ${valor.replace(/\D/g, "").length}.`;
    }
    if (!validarRuc(valor)) {
      return "Ese RUC no es válido: el dígito verificador no cuadra. Revísalo con el cliente.";
    }
    return null;
  }

  // 06 pasaporte · 08 identificación del exterior
  if (valor.length > 20) return "La identificación no puede pasar de 20 caracteres.";
  if (!/^[A-Za-z0-9-]+$/.test(valor)) {
    return "Solo se admiten letras, números y guiones.";
  }
  return null;
}

/** Aborta la emisión si la identificación no es válida. */
export function assertIdentificacionValida(tipo: string | undefined, identificacion: string): void {
  const error = validarIdentificacion(tipo, identificacion);
  if (error) throw new FacturacionRechazoError(error);
}

// ─── Sugerencia para la pantalla ─────────────────────────────────────────────

/**
 * Propone un tipo a partir de lo que se escribió, SOLO para ahorrar clics.
 *
 * Devuelve undefined cuando no hay una respuesta clara — y ese es el punto:
 * antes, "no hay respuesta clara" significaba pasaporte. Ahora significa que
 * la persona tiene que elegir.
 */
export function inferirTipoSugerido(identificacion: string): TipoIdentificacion | undefined {
  const v = (identificacion ?? "").trim();
  if (v === IDENTIFICACION_CONSUMIDOR_FINAL) return "07";
  if (/^\d{13}$/.test(v) && validarRuc(v))   return "04";
  if (/^\d{10}$/.test(v) && validarCedula(v)) return "05";
  return undefined;
}

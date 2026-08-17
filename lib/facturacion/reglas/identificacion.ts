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
 *
 * ─── El dígito verificador pasa a ser ADVERTENCIA, no bloqueo (2026-08-17) ───
 *
 * Hotfix urgente: el RUC 1091797592001 (SALUDSÍ EC S.A.S.) no cumple el
 * algoritmo módulo 11, pero es un RUC REAL — verificado contra el servicio
 * público del SRI: razón social "SALUDSÍ EC S.A.S.", estado ACTIVO, tipo
 * SOCIEDAD. El SRI emite RUCs que no cumplen su propio algoritmo de dígito
 * verificador (no es un caso aislado ni un error de digitación), y el portal
 * los rechazaba de forma dura, dejando el botón "Emitir Factura" deshabilitado
 * sin ninguna forma de continuar. Decisión de Alex: el dígito verificador
 * pasa a ser una ADVERTENCIA visible, no un bloqueo.
 *
 * Esto NO reabre el agujero que motivó este módulo (893849324, arriba): esa
 * cédula se rechaza por LARGO — "tiene 9 dígitos, no 10" — un chequeo
 * estructural que sigue siendo bloqueo duro, sin tocar. Relajar el dígito
 * verificador no cambia en nada esa validación.
 *
 * Lo que sigue bloqueando (ERROR, corta la emisión):
 *   · tipo vacío o desconocido/no soportado
 *   · identificación vacía
 *   · largo incorrecto para el tipo (cédula ≠10, RUC ≠13)
 *   · caracteres no numéricos en cédula/RUC, o fuera del patrón permitido
 *     en pasaporte/identificación del exterior
 *   · provincia inválida o tercer dígito de persona natural fuera de 0-5 —
 *     esto es estructura del documento, no el dígito verificador; un
 *     documento real nunca falla aquí
 *   · consumidor final con una identificación que no es la genérica
 *
 * Lo que ahora solo ADVIERTE (no bloquea):
 *   · el dígito verificador (el último dígito matemático) no cuadra
 *
 * `revisarIdentificacion()` es la fuente de verdad — devuelve error y
 * advertencia por separado. `validarIdentificacion()` se conserva con su
 * firma de siempre (siguen compilando sus 6 llamadores) pero ahora solo
 * expone el error duro — nunca el mensaje del dígito verificador. Que nadie
 * la "endurezca" de vuelta sin releer este comentario primero.
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

/**
 * Estructura (provincia, tercer dígito) y dígito verificador por separado:
 * la estructura sigue siendo bloqueo duro, el verificador es advertencia
 * (ver el comentario de cabecera, 2026-08-17). Asume que `v` ya tiene
 * exactamente 10 dígitos — el llamador lo comprueba antes.
 */
function detalleCedula(v: string): { estructuraOk: boolean; digitoVerificadorOk: boolean } {
  const provincia = parseInt(v.slice(0, 2), 10);
  if (!PROVINCIAS_VALIDAS.has(provincia)) return { estructuraOk: false, digitoVerificadorOk: false };

  // El tercer dígito de una cédula de persona natural va de 0 a 5.
  if (parseInt(v[2], 10) > 5) return { estructuraOk: false, digitoVerificadorOk: false };

  const coeficientes = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  const suma = coeficientes.reduce((acc, coef, i) => {
    const producto = parseInt(v[i], 10) * coef;
    return acc + (producto >= 10 ? producto - 9 : producto);
  }, 0);

  const verificador = (10 - (suma % 10)) % 10;
  return { estructuraOk: true, digitoVerificadorOk: verificador === parseInt(v[9], 10) };
}

export function validarCedula(valor: string): boolean {
  const v = (valor ?? "").trim();
  if (!/^\d{10}$/.test(v)) return false;
  const d = detalleCedula(v);
  return d.estructuraOk && d.digitoVerificadorOk;
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
/**
 * Misma separación que detalleCedula(): estructura (provincia, establecimiento,
 * tipo de contribuyente) vs dígito verificador. Asume 13 dígitos — el
 * llamador lo comprueba antes. Caso real que motivó esto: 1091797592001
 * (SALUDSÍ EC S.A.S.) tiene estructura válida — provincia 10, sociedad
 * privada (tercero=9) — pero no cumple el módulo 11 de su posición 10.
 */
function detalleRuc(v: string): { estructuraOk: boolean; digitoVerificadorOk: boolean } {
  const provincia = parseInt(v.slice(0, 2), 10);
  if (!PROVINCIAS_VALIDAS.has(provincia)) return { estructuraOk: false, digitoVerificadorOk: false };

  // Los tres últimos dígitos son el establecimiento: 000 no existe.
  if (v.slice(10) === "000") return { estructuraOk: false, digitoVerificadorOk: false };

  const tercero = parseInt(v[2], 10);

  if (tercero <= 5) {
    // Persona natural: el RUC es su cédula + el código de establecimiento.
    return detalleCedula(v.slice(0, 10));
  }

  if (tercero === 6) {
    // Sector público: verificador en la posición 9 (índice 8).
    const esperado = digitoModulo11(v.slice(0, 8), [3, 2, 7, 6, 5, 4, 3, 2]);
    return { estructuraOk: true, digitoVerificadorOk: esperado === parseInt(v[8], 10) };
  }

  if (tercero === 9) {
    // Sociedad privada / extranjera: verificador en la posición 10 (índice 9).
    const esperado = digitoModulo11(v.slice(0, 9), [4, 3, 2, 7, 6, 5, 4, 3, 2]);
    return { estructuraOk: true, digitoVerificadorOk: esperado === parseInt(v[9], 10) };
  }

  // 7 y 8 no corresponden a ningún tipo de contribuyente — esto sí es
  // estructura inválida, no un problema de dígito verificador.
  return { estructuraOk: false, digitoVerificadorOk: false };
}

export function validarRuc(valor: string): boolean {
  const v = (valor ?? "").trim();
  if (!/^\d{13}$/.test(v)) return false;
  const d = detalleRuc(v);
  return d.estructuraOk && d.digitoVerificadorOk;
}

// ─── Validación completa ─────────────────────────────────────────────────────

export type RevisionIdentificacion = { error: string | null; advertencia: string | null };

/**
 * Fuente de verdad: separa lo que BLOQUEA la emisión (`error`) de lo que solo
 * ADVIERTE sin bloquear (`advertencia`) — ver el comentario de cabecera
 * (2026-08-17) para el porqué exacto de cada categoría.
 *
 * Fail closed en todo lo que sigue siendo error: un tipo vacío o desconocido
 * NO se deja pasar. Antes, un valor que no cuadraba terminaba en "pasaporte"
 * sin que nadie lo eligiera; ahora bloquea y obliga a decidir.
 */
export function revisarIdentificacion(tipo: string | undefined, identificacion: string): RevisionIdentificacion {
  const codigo = (tipo ?? "").trim();
  const valor  = (identificacion ?? "").trim();
  const sinAdvertencia = (error: string | null): RevisionIdentificacion => ({ error, advertencia: null });

  if (!codigo) {
    return sinAdvertencia("Elige el tipo de identificación (cédula, RUC, pasaporte…).");
  }
  if (!esTipoValido(codigo)) {
    return sinAdvertencia(`Tipo de identificación desconocido: "${codigo}".`);
  }

  if (codigo === "07") {
    if (valor && valor !== IDENTIFICACION_CONSUMIDOR_FINAL) {
      return sinAdvertencia(`Consumidor final debe ir con la identificación ${IDENTIFICACION_CONSUMIDOR_FINAL}.`);
    }
    return sinAdvertencia(null);
  }

  if (!valor) return sinAdvertencia("Falta la identificación del cliente.");

  if (codigo === "05") {
    if (!/^\d{10}$/.test(valor)) {
      return sinAdvertencia(
        `Una cédula tiene 10 dígitos; esta tiene ${valor.replace(/\D/g, "").length}. ` +
        "Si es un documento extranjero, elige 'Pasaporte' o 'Identificación del exterior'."
      );
    }
    const detalle = detalleCedula(valor);
    if (!detalle.estructuraOk) {
      return sinAdvertencia("Esa cédula no es válida: la provincia o el tercer dígito no corresponden a ningún documento real.");
    }
    if (!detalle.digitoVerificadorOk) {
      return {
        error: null,
        advertencia: "El dígito verificador de esta cédula no cuadra. Verifícala con el cliente antes de continuar.",
      };
    }
    return sinAdvertencia(null);
  }

  if (codigo === "04") {
    if (!/^\d{13}$/.test(valor)) {
      return sinAdvertencia(`Un RUC tiene 13 dígitos; este tiene ${valor.replace(/\D/g, "").length}.`);
    }
    const detalle = detalleRuc(valor);
    if (!detalle.estructuraOk) {
      return sinAdvertencia("Ese RUC no es válido: la provincia, el establecimiento o el tipo de contribuyente no corresponden a ningún documento real.");
    }
    if (!detalle.digitoVerificadorOk) {
      return {
        error: null,
        advertencia: "El dígito verificador de este RUC no cuadra. Verifícalo con el cliente antes de emitir.",
      };
    }
    return sinAdvertencia(null);
  }

  // 06 pasaporte · 08 identificación del exterior
  if (valor.length > 20) return sinAdvertencia("La identificación no puede pasar de 20 caracteres.");
  if (!/^[A-Za-z0-9-]+$/.test(valor)) {
    return sinAdvertencia("Solo se admiten letras, números y guiones.");
  }
  return sinAdvertencia(null);
}

/**
 * Compatibilidad: firma de siempre, pero devuelve SOLO el error duro — nunca
 * el mensaje del dígito verificador (eso es `revisarIdentificacion(...).advertencia`).
 * Todos los llamadores existentes que bloqueaban con este valor ahora dejan
 * pasar el caso SALUDSÍ automáticamente, sin tocarlos uno por uno.
 */
export function validarIdentificacion(tipo: string | undefined, identificacion: string): string | null {
  return revisarIdentificacion(tipo, identificacion).error;
}

/** Aborta la emisión si la identificación tiene un ERROR duro (nunca por una advertencia). */
export function assertIdentificacionValida(tipo: string | undefined, identificacion: string): void {
  const { error } = revisarIdentificacion(tipo, identificacion);
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

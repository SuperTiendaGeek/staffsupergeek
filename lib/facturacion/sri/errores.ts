/**
 * Traducción de los mensajes del SRI a lenguaje entendible, con la acción
 * concreta que resuelve cada caso.
 *
 * Sin "server-only": la pantalla del historial también los muestra.
 *
 * ─── Por qué no "mitiga" solo ────────────────────────────────────────────────
 *
 * Casi todos los rechazos del SRI son de DATOS o de CONFIGURACIÓN: una cédula
 * equivocada, un cliente sin identificar en una venta sobre $50, un certificado
 * vencido. El sistema no puede adivinar el dato correcto, y un programa que
 * "corrige solo" un documento tributario estaría inventando información.
 *
 * Lo que sí puede hacer, y hace aquí, es leer el código, decir en español qué
 * pasó y qué hay que hacer, y si el problema tiene arreglo desde el portal,
 * decirlo. El único caso que se resuelve solo —y ya lo hacía emitirFactura()—
 * es el 43/45: si el SRI dice que ese número ya está registrado, no hay nada
 * que decidir, hay que avanzar al siguiente.
 */

export type MensajeSriCrudo = {
  identificador?: string;
  tipo?: string;
  mensaje?: string;
  informacionAdicional?: string;
};

export type MensajeExplicado = {
  codigo: string;
  /** El texto tal cual lo devolvió el SRI, para no perder el original. */
  original: string;
  /** Qué pasó, en español llano. */
  queSignifica: string;
  /** Qué hay que hacer. */
  queHacer: string;
  /** ¿Se corrige desde el portal y se puede reenviar la misma factura? */
  corregible: boolean;
};

type Entrada = { queSignifica: string; queHacer: string; corregible: boolean };

/**
 * Los códigos que de verdad aparecen. La lista no pretende ser exhaustiva —
 * lo que no esté aquí se muestra con el texto original del SRI, que ya suele
 * ser bastante explícito.
 */
const CATALOGO: Record<string, Entrada> = {
  "39": {
    queSignifica: "La firma electrónica del comprobante no es válida para el SRI. Lo más común, con diferencia, es que el certificado haya vencido.",
    queHacer: "Revisa Facturación → Firma electrónica. Si está vencida o por vencer, carga el certificado renovado y vuelve a emitir.",
    corregible: true,
  },
  "43": {
    queSignifica: "Esa clave de acceso ya está registrada en el SRI: el comprobante ya había entrado antes.",
    queHacer: "No hace falta hacer nada. El sistema avanza solo al siguiente número. Si la factura anterior quedó a medias, búscala en el historial y consulta su estado.",
    corregible: false,
  },
  "45": {
    queSignifica: "Ese número de factura ya tiene un comprobante en el SRI.",
    queHacer: "El sistema avanza solo al siguiente número. Si el sistema viejo todavía está emitiendo en esta misma serie, hay que apagarlo — no pueden emitir los dos a la vez.",
    corregible: false,
  },
  "65": {
    queSignifica: "La fecha de emisión está fuera del plazo que acepta el SRI. Pasa al reenviar un comprobante viejo, o si la fecha del servidor no coincide con la de Ecuador.",
    queHacer: "Esta factura ya no se puede autorizar con esa fecha. Emite una nueva; el número anterior queda registrado como no emitido y no se reutiliza.",
    corregible: false,
  },
  "69": {
    queSignifica: "El SRI no acepta al comprador tal como viene. El caso típico: una venta de más de $50 a nombre de CONSUMIDOR FINAL.",
    queHacer: "Pide al cliente su cédula o RUC y vuelve a emitir con esos datos. Por regla del SRI, una factura sobre $50 no puede ir a consumidor final.",
    corregible: true,
  },
  "70": {
    queSignifica: "Hay un error en uno de los datos del comprobante: identificación, fechas o importes que no cuadran.",
    queHacer: "Revisa el detalle del mensaje original, corrige el dato en el formulario y vuelve a emitir.",
    corregible: true,
  },
  "35": {
    queSignifica: "El comprobante no cumple el formato que exige el SRI (falta un dato obligatorio o está mal escrito).",
    queHacer: "Es un problema de construcción del documento, no tuyo. Guarda el mensaje completo y pásalo a soporte técnico.",
    corregible: false,
  },
  "50": {
    queSignifica: "El SRI tuvo un problema interno procesando el comprobante.",
    queHacer: "No es culpa del documento. Espera unos minutos y consulta el estado de nuevo — no emitas otra factura por esta venta.",
    corregible: false,
  },
  "EN-PROCESO": {
    queSignifica: "El SRI recibió la factura y todavía no la resuelve. El comprobante existe allá, con su número y su clave.",
    queHacer: "Espera unos minutos y pulsa 'Consultar estado' en el historial. No emitas otra factura por esta venta: duplicarías el documento.",
    corregible: false,
  },
};

function textoOriginal(m: MensajeSriCrudo): string {
  const base = `${m.tipo ? m.tipo + ": " : ""}${m.mensaje ?? ""}`.trim();
  return m.informacionAdicional ? `${base} — ${m.informacionAdicional}` : base;
}

/** Traduce un mensaje del SRI. Si el código no está en el catálogo, no inventa nada. */
export function explicarMensajeSri(m: MensajeSriCrudo): MensajeExplicado {
  const codigo = (m.identificador ?? "").trim() || "SIN-CODIGO";
  const entrada = CATALOGO[codigo];

  if (entrada) {
    return { codigo, original: textoOriginal(m), ...entrada };
  }

  return {
    codigo,
    original: textoOriginal(m),
    queSignifica: m.mensaje?.trim()
      ? `El SRI rechazó el comprobante con este motivo: ${m.mensaje.trim()}`
      : "El SRI rechazó el comprobante sin dar un motivo legible.",
    queHacer:
      "Revisa el mensaje original. Si no queda claro qué corregir, guárdalo completo y pásalo a soporte técnico.",
    corregible: false,
  };
}

export function explicarMensajesSri(mensajes: MensajeSriCrudo[]): MensajeExplicado[] {
  return (mensajes ?? []).map(explicarMensajeSri);
}

/** ¿Hay algún motivo que el usuario pueda corregir y reenviar? */
export function hayAlgoCorregible(mensajes: MensajeSriCrudo[]): boolean {
  return explicarMensajesSri(mensajes).some((m) => m.corregible);
}

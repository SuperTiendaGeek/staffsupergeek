/**
 * Reglas de la corrección de una factura rechazada por el SRI.
 *
 * Sin "server-only": la pantalla necesita las mismas reglas para saber qué
 * botón mostrar y qué campos dejar editables. Funciones puras — sin red, sin
 * Airtable, sin variables de entorno.
 *
 * ─── El principio ────────────────────────────────────────────────────────────
 *
 * Una factura DEVUELTA o NO AUTORIZADA no es una factura perdida: es una
 * factura pendiente de resolver. El secuencial queda reservado para ella para
 * siempre y jamás se reutiliza para otra venta, pero eso no significa
 * abandonarlo. Si el error es corregible, se corrige el dato, se regenera el
 * XML, se firma otra vez y se reenvía LA MISMA factura — mismo número, misma
 * clave, misma identidad.
 *
 * Lo que nunca debe pasar:
 *     rechazo → quemar el número → crear otra factura automáticamente
 *
 * ─── El límite de la fecha, y por qué no es negociable ───────────────────────
 *
 * La clave de acceso de 49 dígitos lleva la FECHA DE EMISIÓN dentro. Conservar
 * la clave obliga a conservar la fecha. Y el SRI rechaza por extemporáneo un
 * comprobante fechado días atrás — más aún desde que la transmisión es en
 * tiempo real (Resolución NAC-DGERCGC25-00000017).
 *
 * De ahí la regla: el mismo día se reenvía la misma factura; pasado el día,
 * esa factura ya no se puede autorizar y hay que emitir una nueva. El número
 * viejo queda registrado como no emitido y NUNCA se reutiliza.
 */

import { hayAlgoCorregible, type MensajeSriCrudo } from "../sri/errores";

// ─── Identidad del comprobante: lo que jamás cambia ──────────────────────────

/**
 * Campos que definen la identidad del comprobante. Una vez asignado el
 * secuencial, ninguno puede tocarse: cambiarlos convertiría la factura de un
 * cliente en la venta de otro, que es justo lo que hay que impedir.
 */
export const CAMPOS_BLOQUEADOS = [
  "establecimiento",
  "puntoEmision",
  "secuencial",
  "numeroFactura",
  "claveAcceso",
  "fechaEmision",
  "recordId",
  "origen",           // la orden u operación comercial de la que nace
] as const;

/**
 * Lo que sí se puede corregir. Son los datos que de verdad provocan los
 * rechazos del SRI.
 */
export const CAMPOS_EDITABLES = [
  "tipoIdentificacionComprador",
  "razonSocialComprador",
  "identificacionComprador",
  "correoComprador",
  "detalles",
] as const;

// ─── ¿Qué se puede hacer con esta factura? ───────────────────────────────────

export type ModoCorreccion =
  /** Se corrige y se reenvía LA MISMA factura: mismo número, misma clave. */
  | "reenviar-misma"
  /** Ya no se puede autorizar con su fecha: hay que emitir una nueva. */
  | "emitir-nueva"
  /** No corresponde corregir (autorizada, anulada, o todavía en el SRI). */
  | "bloqueado";

export type EvaluacionCorreccion = {
  modo: ModoCorreccion;
  motivo: string;
};

export type ContextoCorreccion = {
  /** Estado actual de la factura en el sistema. */
  estado: string;
  /** Fecha de emisión ORIGINAL del comprobante. */
  fechaEmision: Date;
  /** Fecha civil de Ecuador en este momento. */
  ahora: Date;
  /** Mensajes que devolvió el SRI en el último intento. */
  mensajes?: MensajeSriCrudo[];
};

const ESTADOS_CORREGIBLES = new Set(["DEVUELTA", "NO AUTORIZADO"]);
const ESTADOS_EN_CURSO    = new Set(["PENDIENTE", "RECIBIDA", "EN PROCESAMIENTO"]);

/** ¿Es el mismo día civil? Se comparan día, mes y año, no horas. */
export function esMismoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
      && a.getMonth()    === b.getMonth()
      && a.getDate()     === b.getDate();
}

export function evaluarCorreccion(ctx: ContextoCorreccion): EvaluacionCorreccion {
  // ── Una factura autorizada está cerrada ──────────────────────────────────
  if (ctx.estado === "AUTORIZADO") {
    return {
      modo: "bloqueado",
      motivo:
        "Esta factura ya fue autorizada por el SRI. No se puede editar ni volver a enviar. " +
        "Si hay algo que corregir, se hace con una nota de crédito o con una anulación.",
    };
  }

  if (ctx.estado === "ANULADA") {
    return { modo: "bloqueado", motivo: "Esta factura está anulada." };
  }

  // ── Todavía en manos del SRI: no se toca ─────────────────────────────────
  if (ESTADOS_EN_CURSO.has(ctx.estado)) {
    return {
      modo: "bloqueado",
      motivo:
        "El SRI todavía no ha resuelto esta factura. No se puede corregir ni emitir otra por " +
        "esta venta: usa 'Consultar estado' hasta que haya una respuesta definitiva.",
    };
  }

  if (ctx.estado === "BORRADOR") {
    return {
      modo: "bloqueado",
      motivo: "Esto es un borrador, todavía no tiene número. Ábrelo y emítelo normalmente.",
    };
  }

  if (!ESTADOS_CORREGIBLES.has(ctx.estado)) {
    return { modo: "bloqueado", motivo: `No se puede corregir una factura en estado ${ctx.estado}.` };
  }

  // ── Rechazada: decide la fecha ───────────────────────────────────────────
  if (esMismoDia(ctx.fechaEmision, ctx.ahora)) {
    return {
      modo: "reenviar-misma",
      motivo:
        "Se corrige y se reenvía esta misma factura, conservando su número y su clave de acceso.",
    };
  }

  return {
    modo: "emitir-nueva",
    motivo:
      "Esta factura es de un día anterior. Su clave de acceso lleva esa fecha dentro, y el SRI " +
      "rechaza por extemporáneo un comprobante fechado atrás, así que ya no se puede autorizar " +
      "tal cual. Hay que emitir una factura nueva; este número queda registrado como no emitido " +
      "y no se reutiliza para ninguna otra venta.",
  };
}

/** ¿Tiene sentido ofrecer el botón "Corregir"? */
export function permiteCorregir(ctx: ContextoCorreccion): boolean {
  return evaluarCorreccion(ctx).modo !== "bloqueado";
}

/**
 * ¿El SRI señaló algo que el usuario pueda arreglar?
 *
 * Es informativo, no un bloqueo: aunque el código no esté en el catálogo, el
 * usuario debe poder intentar la corrección. Nunca se le cierra la puerta por
 * un mensaje que no supimos clasificar.
 */
export function errorParecCorregible(mensajes: MensajeSriCrudo[] = []): boolean {
  return hayAlgoCorregible(mensajes);
}

// ─── Rastro de lo que cambió ─────────────────────────────────────────────────

export type DatosComparables = {
  identificacionComprador?: string;
  razonSocialComprador?:    string;
  correoComprador?:         string;
  importeTotal?:            number;
};

/**
 * Describe en una línea qué se cambió al corregir. Va al historial de intentos.
 *
 * El cambio de IMPORTE TOTAL se marca aparte y en mayúsculas a propósito: es
 * la señal de que la corrección dejó de ser un arreglo de datos y tocó la
 * operación comercial. No se prohíbe —a veces el rechazo es justamente por una
 * tarifa de IVA mal puesta— pero nunca puede pasar desapercibido.
 */
export function describirCambios(antes: DatosComparables, despues: DatosComparables): string[] {
  const cambios: string[] = [];

  const campo = (
    etiqueta: string,
    a: string | undefined,
    b: string | undefined
  ) => {
    const va = (a ?? "").trim();
    const vb = (b ?? "").trim();
    if (va !== vb) cambios.push(`${etiqueta}: "${va || "(vacío)"}" → "${vb || "(vacío)"}"`);
  };

  campo("Identificación", antes.identificacionComprador, despues.identificacionComprador);
  campo("Razón social",   antes.razonSocialComprador,    despues.razonSocialComprador);
  campo("Correo",         antes.correoComprador,         despues.correoComprador);

  const ta = antes.importeTotal   ?? 0;
  const tb = despues.importeTotal ?? 0;
  if (Math.abs(ta - tb) > 0.001) {
    cambios.push(`⚠ IMPORTE TOTAL: $${ta.toFixed(2)} → $${tb.toFixed(2)}`);
  }

  return cambios;
}

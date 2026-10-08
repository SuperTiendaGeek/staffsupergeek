// "Líneas JSON" de una factura: cómo se escribe y cómo se vuelve a leer para
// completar lo que pasa DESPUÉS de la autorización del SRI (descargo de
// inventario, puente contable, cierre de reserva, vínculos al origen).
//
// ─── Por qué existe (factura 001-002-000000755, 5 de octubre de 2026) ───────
//
// Hasta este cambio las líneas solo se guardaban cuando la autorización
// llegaba DENTRO de la misma petición de "Emitir". Si el SRI tardaba más de
// 60 s (o la función se cortaba antes de terminar), la fila quedaba RECIBIDA
// sin líneas, la emisión devolvía "EN PROCESAMIENTO" y no se descontaba
// nada. Cuando luego alguien pulsaba "⟳ Consultar estado", la factura pasaba
// a AUTORIZADO con su XML y su RIDE, pero sin líneas, sin descargo, sin
// ingreso en Finanzas y sin vínculo a su orden/operación. El XML del SRI lleva
// el SKU de cada artículo pero no su record id, así que ya no había forma
// automática de saber qué descontar. Seis facturas reales quedaron así.
//
// Este módulo es puro (sin Airtable) para poder probarlo sin red.

import type { CampoAdicional, DetalleFactura, Pago } from "../types/factura";

export type OrigenLineas = { tipo: "orden" | "operacion" | "reserva"; recordId: string };

export type LineasFacturaGuardadas = {
  version:          number;
  detalles:         DetalleFactura[];
  pagos:            Pago[];
  infoAdicional?:   CampoAdicional[];
  origen?:          OrigenLineas;
  clienteRecordId?: string;
  /**
   * "xml-sri" cuando las líneas se reconstruyeron desde el XML autorizado
   * (recuperar por clave): describen bien la venta pero NO traen el record id
   * de cada Shipping Item, así que no sirven para descargar inventario.
   */
  fuente?:          "xml-sri";
  /**
   * Cuándo se armaron (ISO). Sirve para no pisar a la propia petición de
   * emisión: mientras pueda seguir viva (maxDuration 90 s) es ELLA la que
   * descarga; si otro camino lo hiciera a la vez, ambos leerían el stock
   * antes de que el otro escriba y se descontaría dos veces.
   */
  preparadaEn?:     string;
};

/** Margen sobre el maxDuration (90 s) de emitir/corregir/reintentar. */
export const VENTANA_EMISION_EN_CURSO_MS = 100_000;

/**
 * Envoltorio v3 de siempre (`version`, `detalles`, `formaPago`, `pagos`,
 * `infoAdicional`, `origen`) + `clienteRecordId`, que antes se perdía y hace
 * falta para completar los efectos fuera de la petición de emisión.
 * `formaPago` suelto se conserva por compatibilidad con lectores viejos.
 */
export function serializarLineasFactura(input: {
  detalles:         DetalleFactura[];
  pagos:            Pago[];
  infoAdicional?:   CampoAdicional[];
  origen?:          OrigenLineas;
  clienteRecordId?: string;
  ahora?:           Date;
}): string {
  return JSON.stringify({
    version:         3,
    detalles:        input.detalles,
    formaPago:       input.pagos[0]?.formaPago,
    pagos:           input.pagos,
    infoAdicional:   input.infoAdicional?.length ? input.infoAdicional : undefined,
    origen:          input.origen,
    clienteRecordId: input.clienteRecordId,
    preparadaEn:     (input.ahora ?? new Date()).toISOString(),
  });
}

function esOrigen(v: unknown): v is OrigenLineas {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (o.tipo === "orden" || o.tipo === "operacion" || o.tipo === "reserva") &&
    typeof o.recordId === "string" && o.recordId.startsWith("rec");
}

function esPago(v: unknown): v is Pago {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  return typeof p.formaPago === "string" && typeof p.total === "number";
}

/**
 * Lee el "Líneas JSON" de una factura emitida. Devuelve null si está vacío o
 * no tiene la forma de una factura emitida (array suelto, borrador con
 * `lineas`, JSON roto). Nunca lanza.
 */
export function leerLineasFactura(raw: string | null | undefined): LineasFacturaGuardadas | null {
  if (!raw || !raw.trim()) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return null; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.detalles)) return null;

  const detalles = obj.detalles as DetalleFactura[];
  // Facturas viejas guardaban solo `formaPago` (string). Sin el total no se
  // puede reconstruir el pago con seguridad: se deja vacío y el puente
  // contable no se corre para ellas (ver planificarCompletarFactura).
  const pagos = Array.isArray(obj.pagos) ? (obj.pagos as unknown[]).filter(esPago) : [];

  return {
    version:         typeof obj.version === "number" ? obj.version : 0,
    detalles,
    pagos,
    infoAdicional:   Array.isArray(obj.infoAdicional) ? (obj.infoAdicional as CampoAdicional[]) : undefined,
    origen:          esOrigen(obj.origen) ? obj.origen : undefined,
    clienteRecordId: typeof obj.clienteRecordId === "string" && obj.clienteRecordId.startsWith("rec") ? obj.clienteRecordId : undefined,
    fuente:          obj.fuente === "xml-sri" ? "xml-sri" : undefined,
    preparadaEn:     typeof obj.preparadaEn === "string" ? obj.preparadaEn : undefined,
  };
}

/** Líneas que mueven inventario (Shipping Items) o productos digitales. */
export function lineasConInventario(detalles: DetalleFactura[]): DetalleFactura[] {
  return detalles.filter(
    (d) => (d.tipo === "producto" && !!d.shippingItemId) || (d.tipo === "productoDigital" && !!d.productoDigitalId)
  );
}

export type EstadoSincronizacion = "N/A" | "PENDIENTE" | "OK" | "ERROR";

export type PlanCompletarFactura =
  | { accion: "nada"; motivo: string }
  | { accion: "sin-lineas"; motivo: string }
  | { accion: "en-curso"; motivo: string }
  | {
      accion: "completar";
      inventario:   boolean;  // correr postEmision (idempotente por el link Factura del item)
      finanzas:     boolean;  // correr el puente de facturación
      reserva:      boolean;  // cerrar la reserva de origen
      vincularOrigen: boolean;
    };

/**
 * Decide qué falta hacer en una factura YA AUTORIZADA. Es la misma lista de
 * efectos que corre POST /api/facturacion/emitir cuando la autorización llega
 * a tiempo; aquí se decide cuáles faltan cuando la autorización llegó por otro
 * camino (consultar estado, recuperar, reintento manual).
 *
 * Reglas:
 *  - Solo facturas AUTORIZADO de PRODUCCIÓN (pruebas nunca toca inventario ni
 *    Finanzas — mismo guardián que postEmision y el puente).
 *  - Inventario: siempre que la sincronización no esté OK. postEmision es
 *    idempotente (el link "Factura" del artículo es la marca de hecho), así
 *    que repetirlo nunca descuenta dos veces.
 *  - Finanzas: solo si la factura no tiene NINGÚN movimiento vinculado y hay
 *    pagos con total. El puente no es idempotente por sí mismo; esta es su
 *    barrera.
 *  - Sin líneas legibles → "sin-lineas": hay que regularizar a mano, y debe
 *    quedar a la vista (no en silencio como "N/A").
 */
export function planificarCompletarFactura(f: {
  estado:                   string;
  ambiente:                 string;   // "PRODUCCIÓN" | "PRUEBAS"
  sincronizacionInventario: EstadoSincronizacion;
  movimientosFinancierosIds: string[];
  lineas:                   LineasFacturaGuardadas | null;
  /** Vínculos que la factura ya tiene en Airtable (campos Orden/Operación/Cliente). */
  vinculos?:                { orden: string[]; operacion: string[]; cliente: string[] };
  ahora?:                   Date;
}): PlanCompletarFactura {
  if (f.estado !== "AUTORIZADO") return { accion: "nada", motivo: `La factura está ${f.estado}, no AUTORIZADO.` };
  if (f.ambiente !== "PRODUCCIÓN") return { accion: "nada", motivo: "Factura de PRUEBAS: no toca inventario ni Finanzas." };
  if (!f.lineas) {
    if (f.sincronizacionInventario === "OK") return { accion: "nada", motivo: "Sin líneas, pero el inventario ya se regularizó (OK)." };
    return {
      accion: "sin-lineas",
      motivo: "La factura no tiene líneas guardadas: no se sabe qué artículos descontar. Hay que regularizar el inventario a mano.",
    };
  }
  if (f.lineas.preparadaEn) {
    const t = Date.parse(f.lineas.preparadaEn);
    const ahora = (f.ahora ?? new Date()).getTime();
    if (Number.isFinite(t) && ahora - t >= 0 && ahora - t < VENTANA_EMISION_EN_CURSO_MS) {
      return {
        accion: "en-curso",
        motivo: "La emisión de esta factura puede seguir en curso. Espera unos 2 minutos y vuelve a intentarlo.",
      };
    }
  }
  if (f.lineas.fuente === "xml-sri" && f.sincronizacionInventario !== "OK") {
    const codigos = f.lineas.detalles.map((d) => d.codigoPrincipal || d.descripcion).filter(Boolean);
    return {
      accion: "sin-lineas",
      motivo:
        "Factura recuperada desde el SRI: sus líneas no traen el vínculo a Shipping Items, así que el inventario " +
        `NO se descargó automáticamente. Descargar a mano: ${codigos.join(", ")}.`,
    };
  }
  const inventario = f.sincronizacionInventario !== "OK";
  const finanzas   = f.movimientosFinancierosIds.length === 0 && f.lineas.pagos.some((p) => p.total > 0);
  // La reserva se cierra junto con el primer descargo (marcarReservaFacturada
  // es idempotente, pero no hace falta reescribirla en cada consulta).
  const reserva    = f.lineas.origen?.tipo === "reserva" && inventario;
  const v = f.vinculos ?? { orden: [], operacion: [], cliente: [] };
  const o = f.lineas.origen;
  const vincularOrigen =
    (o?.tipo === "orden" && !v.orden.includes(o.recordId)) ||
    (o?.tipo === "operacion" && !v.operacion.includes(o.recordId)) ||
    (!!f.lineas.clienteRecordId && !v.cliente.includes(f.lineas.clienteRecordId));
  if (!inventario && !finanzas && !reserva && !vincularOrigen) {
    return { accion: "nada", motivo: "No falta nada: inventario OK y Finanzas ya registrado." };
  }
  return { accion: "completar", inventario, finanzas, reserva, vincularOrigen };
}

/**
 * ¿Esta factura debe mostrarse como "inventario sin procesar"? Desde la Fase
 * 17.b toda factura AUTORIZADA de producción termina en OK o ERROR (también
 * las de mostrador sin artículos: quedan OK). Un "N/A" en una AUTORIZADA de
 * producción significa que el paso posterior a la autorización nunca corrió.
 */
export function inventarioSinProcesar(f: { estado: string; ambiente: string; sincronizacionInventario: string }): boolean {
  return f.estado === "AUTORIZADO" && f.ambiente === "PRODUCCIÓN" &&
    (f.sincronizacionInventario === "N/A" || f.sincronizacionInventario === "");
}

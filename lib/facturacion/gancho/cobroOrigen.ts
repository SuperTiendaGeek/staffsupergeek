import "server-only";

// Validación de la emisión desde una orden u operación — auditoría Técnicos y
// Operaciones, punto 1 (27-oct-2026). La usan /api/facturacion/emitir y
// /api/facturacion/recibos, así las dos puertas aplican exactamente la misma
// regla (reglas puras en ../reglas/cobroDocumento.ts):
//
//   1. La cuenta se arma OTRA VEZ en el servidor (construirPreFactura); lo
//      que manda la pantalla nunca es la fuente.
//   2. Las líneas de la cuenta tienen que llegar sin cambios.
//   3. La cuenta tiene que estar pagada con abonos (saldo $0).
//   4. La venta adicional se cobra al emitir, con método (y cuenta) válido.
//   5. Las formas de pago del documento = abonos (del servidor) + cobros de
//      la venta adicional.

import type { Pago } from "../types/factura";
import type { OrigenGancho } from "../emitirFactura";
import { construirPreFactura, type PreFacturaBloqueada, type PreFacturaLista } from "./traductor";
import { buscarDocumentoBloqueante } from "./idempotencia";
import { MAPA_METODO_PAGO_SRI, FORMA_PAGO_FALLBACK } from "./config";
import { getCuentaUnificada } from "@/lib/cuenta-unificada";
import {
  componerPagosDocumento,
  mensajeBloqueCuentaModificado,
  mensajeCuentaNoPagada,
  mensajePagosAdicionalesInvalidos,
  mensajeAbonoNoPermitido,
  totalFinalLinea,
  type LineaComparable,
  type PagoAdicionalInput,
} from "../reglas/cobroDocumento";

export type ResultadoCobroOrigen =
  | { ok: true; pagos: Pago[]; totalCuenta: number; prefactura: PreFacturaLista }
  | { ok: false; status: number; error: string };

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function mensajePrefacturaBloqueada(b: PreFacturaBloqueada): string {
  switch (b.motivo) {
    case "FACTURA_EXISTENTE":
      return `Esta cuenta ya tiene una factura ${b.facturaExistente?.estado ?? ""} (${b.facturaExistente?.numeroFactura || b.facturaExistente?.claveAcceso || ""}).`;
    case "RECIBO_EXISTENTE":
      return `Esta cuenta ya tiene un recibo ${b.reciboExistente?.estado ?? ""} (${b.reciboExistente?.numero ?? ""}).`;
    case "PRESUPUESTO_PENDIENTE":
      return "Hay líneas aprobadas por el cliente que todavía no tienen su artículo. El documento espera a que exista.";
    case "ITEMS_NO_LISTOS":
      return `Hay artículos que todavía no se pueden vender: ${(b.itemsNoListos ?? []).map((i) => i.nombre).join(", ")}.`;
    case "PRODUCTOS_DIGITALES_SIN_PRECIO":
      return `Hay productos digitales sin nombre o sin precio: ${(b.productosDigitalesNoListos ?? []).map((i) => i.nombre).join(", ")}.`;
    case "LINEA_NEGATIVA":
      return `La cuenta tiene cargos negativos (descuentos o ajustes): ${(b.lineasNegativas ?? []).map((l) => l.descripcion).join(", ")}. Todavía no se pueden llevar a un documento.`;
  }
}

/**
 * Devuelve las formas de pago con las que se emite, o el error para la
 * pantalla. Nunca lanza: un fallo de lectura es un 503 (no se emite sin
 * poder verificar — mismo criterio fail-closed del resto de la emisión).
 */
export async function validarEmisionDesdeOrigen(input: {
  origen: OrigenGancho;
  /** Líneas del bloque "cuenta" tal como las manda la pantalla. */
  lineasCuenta: LineaComparable[];
  /** Total final de las líneas de venta adicional. */
  totalAdicional: number;
  pagosAdicionales: PagoAdicionalInput[];
}): Promise<ResultadoCobroOrigen> {
  if (input.origen.tipo !== "orden" && input.origen.tipo !== "operacion") {
    return { ok: false, status: 400, error: "Origen inválido para esta validación." };
  }
  const etiqueta = input.origen.tipo === "orden" ? "orden" : "operación";

  let pre: Awaited<ReturnType<typeof construirPreFactura>>;
  try {
    pre = await construirPreFactura(
      input.origen.tipo === "orden" ? { ordenId: input.origen.recordId } : { operacionId: input.origen.recordId }
    );
  } catch (e) {
    console.error("[cobroOrigen] no se pudo leer la cuenta:", e);
    return { ok: false, status: 503, error: `No se pudo leer la cuenta de la ${etiqueta}. No se emitió nada; intenta de nuevo.` };
  }
  if (pre.bloqueado) return { ok: false, status: 409, error: mensajePrefacturaBloqueada(pre) };

  const esperadas: LineaComparable[] = pre.datosVenta.detalles.map((d) => ({
    descripcion: d.descripcion,
    cantidad: d.cantidad,
    total: totalFinalLinea(d),
    shippingItemId: d.shippingItemId,
    productoDigitalId: d.productoDigitalId,
  }));
  const modificado = mensajeBloqueCuentaModificado(input.lineasCuenta, esperadas);
  if (modificado) return { ok: false, status: 409, error: modificado };

  const noPagada = mensajeCuentaNoPagada(pre.saldoPorCobrar, etiqueta);
  if (noPagada) return { ok: false, status: 409, error: noPagada };

  const adicionalInvalido = mensajePagosAdicionalesInvalidos(input.pagosAdicionales, input.totalAdicional);
  if (adicionalInvalido) return { ok: false, status: 400, error: adicionalInvalido };

  return {
    ok: true,
    pagos: componerPagosDocumento(pre.datosVenta.pagos, input.pagosAdicionales, (m) => MAPA_METODO_PAGO_SRI[m] ?? FORMA_PAGO_FALLBACK),
    totalCuenta: round2(pre.datosVenta.importeTotal),
    prefactura: pre,
  };
}

/**
 * ¿Se puede registrar un abono nuevo en esta orden/operación? Con documento
 * vigente solo si queda saldo real, y nunca por más (auditoría ops, punto 1 —
 * evita el doble ingreso del caso OR000510). Devuelve null si se puede, o el
 * error con su código HTTP. Falla cerrado: sin poder verificar, no se registra.
 */
export async function verificarAbonoPermitido(
  origen: { tipo: "orden" | "operacion"; recordId: string },
  monto: number
): Promise<{ status: number; error: string } | null> {
  const etiqueta = origen.tipo === "orden" ? "orden" : "operación";
  try {
    const documento = await buscarDocumentoBloqueante(origen);
    if (!documento) return null;
    const cuenta = await getCuentaUnificada(origen.tipo === "orden" ? { ordenId: origen.recordId } : { operacionId: origen.recordId });
    const nombreDocumento = documento.tipo === "factura"
      ? `la factura ${documento.factura.numeroFactura || documento.factura.claveAcceso}`
      : `el recibo ${documento.recibo.numero}`;
    const error = mensajeAbonoNoPermitido({ documentoVigente: nombreDocumento, saldo: cuenta.saldo, monto, etiqueta });
    return error ? { status: 409, error } : null;
  } catch (e) {
    console.error("[verificarAbonoPermitido]", e);
    return { status: 503, error: `No se pudo verificar si esta ${etiqueta} ya tiene un documento emitido. No se registró el abono; intenta de nuevo.` };
  }
}

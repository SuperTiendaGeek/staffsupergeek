/**
 * Cálculos y reglas puras de la nota de crédito (sin red, sin Airtable).
 * Separado del orquestador para poder testearlo sin mockear nada.
 *
 * Sin "server-only": estas funciones también las necesita la UI para la
 * vista previa de totales antes de emitir (mismo criterio que ivaIncluido.ts).
 */

import type { DetalleFactura } from "../types/factura";
import type { DetalleNotaCredito, TotalImpuestoNotaCredito } from "./types";

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ─── Conversión de líneas de la factura original a líneas de NC ──────────────
//
// La NC se construye SIEMPRE a partir de las líneas de la factura original
// (nunca se teclean de cero): así la tarifa de IVA, la descripción y el
// precio son exactamente los del documento que se modifica — requisito del
// SRI (la NC debe usar la tarifa de la factura original, no la vigente hoy).
//
// `cantidadAcreditada` permite NC parcial: acreditar 1 de 3 unidades. Si no
// se pasa, se acredita la línea completa.

export type SeleccionLinea = {
  /** Índice de la línea en los detalles de la factura original. */
  indice: number;
  /** Unidades a acreditar. Debe ser > 0 y <= cantidad de la línea original. */
  cantidadAcreditada: number;
  /** ¿El cliente devolvió físicamente el item? (suma de vuelta al stock) */
  devolucionFisica: boolean;
};

export function construirLineaNotaCredito(
  original: DetalleFactura,
  cantidadAcreditada: number,
  devolucionFisica: boolean
): DetalleNotaCredito {
  const cantidadOriginal = original.cantidad > 0 ? original.cantidad : 1;
  const proporcion = cantidadAcreditada / cantidadOriginal;

  // La base se acredita proporcionalmente a las unidades devueltas. El
  // precioUnitario se conserva tal cual (ya viene en base, sin IVA, desde la
  // factura) para que la ecuación del SRI —cantidad × unitario − descuento =
  // precioTotalSinImpuesto— cuadre igual que en la factura original.
  const baseLinea  = round2(original.precioTotalSinImpuesto * proporcion);
  const descuento  = round2(round2(cantidadAcreditada * original.precioUnitario) - baseLinea);

  const impuestos = original.impuestos.map((imp) => ({
    ...imp,
    baseImponible: baseLinea,
    valor:         round2(baseLinea * (imp.tarifa / 100)),
  }));

  return {
    codigoInterno: original.codigoPrincipal,
    codigoAdicional: original.codigoAuxiliar,
    descripcion: original.descripcion,
    cantidad: cantidadAcreditada,
    precioUnitario: original.precioUnitario,
    descuento: descuento < 0 ? 0 : descuento,
    precioTotalSinImpuesto: baseLinea,
    impuestos,
    tipo: original.tipo,
    shippingItemId: original.shippingItemId,
    productoDigitalId: original.productoDigitalId,
    devolucionFisica,
  };
}

// ─── Totales de la NC ────────────────────────────────────────────────────────

export type TotalesNotaCredito = {
  totalSinImpuestos: number;
  totalConImpuestos: TotalImpuestoNotaCredito[];
  /** Importe total acreditado = base + impuestos. */
  valorModificacion: number;
};

export function calcularTotalesNotaCredito(detalles: DetalleNotaCredito[]): TotalesNotaCredito {
  const porTarifa = new Map<string, { codigo: "2" | "3" | "5"; base: number; valor: number }>();

  for (const d of detalles) {
    for (const imp of d.impuestos) {
      const prev = porTarifa.get(imp.codigoPorcentaje) ?? { codigo: imp.codigo, base: 0, valor: 0 };
      porTarifa.set(imp.codigoPorcentaje, {
        codigo: prev.codigo,
        base:   round2(prev.base + imp.baseImponible),
        valor:  round2(prev.valor + imp.valor),
      });
    }
  }

  const totalConImpuestos: TotalImpuestoNotaCredito[] = [...porTarifa.entries()].map(
    ([codigoPorcentaje, v]) => ({
      codigo: v.codigo,
      codigoPorcentaje,
      baseImponible: v.base,
      valor: v.valor,
    })
  );

  const totalSinImpuestos = round2(totalConImpuestos.reduce((s, t) => s + t.baseImponible, 0));
  const totalImpuestos    = round2(totalConImpuestos.reduce((s, t) => s + t.valor, 0));

  return {
    totalSinImpuestos,
    totalConImpuestos,
    valorModificacion: round2(totalSinImpuestos + totalImpuestos),
  };
}

// ─── Reglas de negocio previas a emitir (§1.3 del diseño Fase 18) ───────────

/** Límite interno de SUPER GEEK, NO del SRI (que hoy no fija tope). */
export const LIMITE_MESES_NOTA_CREDITO = 6;

const TIPO_CONSUMIDOR_FINAL = "07";

export type FacturaParaNotaCredito = {
  estado: string;
  tipoIdentificacionComprador: string;
  fechaEmision: Date;
  importeTotal: number;
  /** Suma de las NC vigentes ya emitidas contra esta factura. */
  totalYaAcreditado: number;
};

export type RechazoNotaCredito = { motivo: string };

/**
 * Devuelve null si la NC se puede emitir, o el motivo del rechazo.
 * Fail-closed: cualquier duda bloquea. Orden pensado para que el mensaje sea
 * el más útil primero (lo que no tiene arreglo antes que lo que sí).
 */
export function evaluarNotaCreditoPermitida(
  factura: FacturaParaNotaCredito,
  montoAcreditar: number,
  ahora: Date
): RechazoNotaCredito | null {
  if (factura.tipoIdentificacionComprador === TIPO_CONSUMIDOR_FINAL) {
    return {
      motivo:
        "Las facturas a CONSUMIDOR FINAL no admiten nota de crédito ni anulación (regla SRI vigente desde el 1-ene-2026). " +
        "La devolución debe manejarse administrativamente: devolver el dinero por caja y ajustar el inventario a mano.",
    };
  }

  if (factura.estado !== "AUTORIZADO") {
    return { motivo: `Solo se puede emitir una nota de crédito sobre una factura AUTORIZADA (estado actual: ${factura.estado}).` };
  }

  const limite = new Date(factura.fechaEmision);
  limite.setMonth(limite.getMonth() + LIMITE_MESES_NOTA_CREDITO);
  if (ahora > limite) {
    return {
      motivo:
        `La factura tiene más de ${LIMITE_MESES_NOTA_CREDITO} meses (límite interno de SUPER GEEK, no del SRI). ` +
        `Consulta con contabilidad antes de acreditarla.`,
    };
  }

  if (montoAcreditar <= 0) {
    return { motivo: "El monto a acreditar debe ser mayor a cero." };
  }

  const disponible = round2(factura.importeTotal - factura.totalYaAcreditado);
  if (round2(montoAcreditar) > disponible + 0.01) {
    return {
      motivo:
        `No se puede acreditar $${montoAcreditar.toFixed(2)}: la factura ya tiene $${factura.totalYaAcreditado.toFixed(2)} ` +
        `acreditado de un total de $${factura.importeTotal.toFixed(2)} (disponible: $${disponible.toFixed(2)}).`,
    };
  }

  return null;
}

/** Motivo obligatorio y específico — el SRI observa los genéricos. */
export function validarMotivo(motivo: string): RechazoNotaCredito | null {
  const limpio = motivo.trim();
  if (limpio.length < 10) {
    return { motivo: "El motivo debe ser específico (mínimo 10 caracteres). Ej: 'Devolución de equipo por falla de temperatura'." };
  }
  if (limpio.length > 300) {
    return { motivo: "El motivo no puede superar 300 caracteres." };
  }
  return null;
}

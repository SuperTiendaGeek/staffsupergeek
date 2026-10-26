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
  /** Punto 7: ¿vuelve en buen estado o con falla? (solo si devolucionFisica) */
  condicion?: "buena" | "falla";
  notaFalla?: string;
  /** Valor que NO se acredita de esta línea, IVA incluido (26-oct-2026).
   *  Ej.: el cliente devuelve la laptop pero perdió el cargador ($70). */
  descontar?: number;
  /** Qué se descuenta y por qué. Obligatorio si hay `descontar`. Va como detalle adicional de la línea. */
  conceptoDescuento?: string;
};

// ─── Descontar un faltante de una línea (26-oct-2026) ────────────────────────
//
// Caso real: el cliente devuelve una laptop vendida "c/ cargador" sin el
// cargador, y acepta que se le descuente su valor. Lo que vuelve vale menos
// que lo que se vendió, así que la nota de crédito acredita MENOS: la factura
// queda vigente por el cargador que el cliente se quedó, con su IVA.
//
// Ante el SRI es una línea de NC con descuento: cantidad × precio unitario −
// descuento = base. Es el mismo mecanismo que ya usa la NC parcial, y la
// tarifa de IVA sigue siendo la de la factura original. El concepto viaja como
// detalle adicional de la línea (queda en el XML autorizado); el RIDE muestra
// el valor en su columna Descuento, y la pantalla pide mencionarlo en el motivo.
//
// El usuario teclea el valor CON IVA (lo que el cliente entiende: "$70 por el
// cargador"). Se pasa a base con la tarifa de la línea; el total acreditado
// puede diferir en un centavo del cálculo a mano por el redondeo del IVA, y la
// pantalla muestra el valor exacto que se emitirá porque usa esta misma función.

export type RechazoDescuento = { motivo: string };

/** Importe escrito en el formulario: acepta punto o coma y hasta dos
 * decimales, sin interpretar parcialmente texto ni redondear lo tecleado. */
export function leerMontoDescuento(texto: string): number | null {
  const limpio = texto.trim();
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(limpio)) return null;
  const monto = Number(limpio.replace(",", "."));
  return Number.isFinite(monto) ? monto : null;
}

/** Lo mínimo de una línea de factura que necesitan estos cálculos (la pantalla
 *  tiene su propia copia del tipo, así que no se exige DetalleFactura entero). */
type LineaParaDescuento = {
  cantidad: number;
  precioTotalSinImpuesto: number;
  impuestos: ReadonlyArray<{ tarifa: number }>;
  descripcion: string;
};

/** Base que se acredita de una línea: proporción por unidades, menos el descuento. */
export function baseAcreditadaLinea(
  original: Omit<LineaParaDescuento, "descripcion">,
  cantidadAcreditada: number,
  descontarConIva = 0
): number {
  const cantidadOriginal = original.cantidad > 0 ? original.cantidad : 1;
  const baseProporcional = round2(original.precioTotalSinImpuesto * (cantidadAcreditada / cantidadOriginal));
  if (!(descontarConIva > 0)) return baseProporcional;
  const tarifa = original.impuestos[0]?.tarifa ?? 0;
  const baseDescuento = round2(descontarConIva / (1 + tarifa / 100));
  return round2(baseProporcional - baseDescuento);
}

/**
 * Valida el descuento de una línea. null = válido (o sin descuento).
 * Lo usan la pantalla y el servidor: el servidor manda.
 */
export function validarDescuentoLinea(
  original: LineaParaDescuento,
  cantidadAcreditada: number,
  descontar: unknown,
  concepto: unknown
): RechazoDescuento | null {
  if (descontar === undefined || descontar === null || descontar === 0 || descontar === "") return null;
  if (typeof descontar !== "number" || !Number.isFinite(descontar) || descontar < 0) {
    return { motivo: `El valor a descontar de "${original.descripcion}" no es válido.` };
  }
  if (Math.abs(round2(descontar) - descontar) > 1e-9) {
    return { motivo: `El valor a descontar de "${original.descripcion}" debe tener máximo dos decimales.` };
  }
  const texto = typeof concepto === "string" ? concepto.trim() : "";
  if (texto.length < 5) {
    return { motivo: `Explica qué se descuenta de "${original.descripcion}" (ej.: "Cargador original no devuelto").` };
  }
  if (texto.length > 200) return { motivo: "El concepto del descuento no puede superar 200 caracteres." };
  // Debe quedar algo que acreditar: si se descuenta todo, esa línea no va en la NC.
  if (!(baseAcreditadaLinea(original, cantidadAcreditada, descontar) > 0)) {
    return { motivo: `El descuento de "${original.descripcion}" es igual o mayor que lo que se acredita de esa línea.` };
  }
  return null;
}

export function construirLineaNotaCredito(
  original: DetalleFactura,
  cantidadAcreditada: number,
  devolucionFisica: boolean,
  devolucion?: { condicion?: "buena" | "falla"; notaFalla?: string },
  descuentoFaltante?: { descontar: number; concepto: string }
): DetalleNotaCredito {
  // La base se acredita proporcionalmente a las unidades devueltas, menos lo
  // que se descuente por faltantes. El precioUnitario se conserva tal cual
  // (ya viene en base, sin IVA, desde la factura) para que la ecuación del
  // SRI —cantidad × unitario − descuento = precioTotalSinImpuesto— cuadre
  // igual que en la factura original.
  const descontar  = descuentoFaltante && descuentoFaltante.descontar > 0 ? descuentoFaltante.descontar : 0;
  const baseLinea  = baseAcreditadaLinea(original, cantidadAcreditada, descontar);
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
    ...(descontar > 0
      ? { detallesAdicionales: [{ nombre: "Descuento", valor: `${descuentoFaltante!.concepto.trim().slice(0, 200)} ($${descontar.toFixed(2)} IVA incluido)` }] }
      : {}),
    tipo: original.tipo,
    shippingItemId: original.shippingItemId,
    productoDigitalId: original.productoDigitalId,
    devolucionFisica,
    // Punto 7: solo tiene sentido si vuelve físicamente.
    ...(devolucionFisica && devolucion?.condicion ? { condicionDevolucion: devolucion.condicion } : {}),
    ...(devolucionFisica && devolucion?.condicion === "falla" && devolucion.notaFalla?.trim() ? { notaFalla: devolucion.notaFalla.trim().slice(0, 300) } : {}),
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

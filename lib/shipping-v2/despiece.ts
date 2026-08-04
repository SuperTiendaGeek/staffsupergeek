// Despiece — desarmar un equipo para vender sus piezas por separado.
//
// Una laptop que no vale la pena reparar entera puede rendir una pantalla, un
// teclado, dos memorias y un disco. El equipo padre deja de existir; las
// piezas nacen como artículos propios del inventario, vinculadas a él.
//
// Aquí vive solo la aritmética y las reglas — sin red, para poder probarlo
// entero. Las escrituras están en airtable.ts. Ver docs/DISENO_DESPIECE.md.

import { normalizarUnidades, unidadesLibres, type UnidadesItem } from "./unidades";

// ─── Quién puede despiezarse ─────────────────────────────────────────────────

/**
 * Estados desde los que tiene sentido desarmar un equipo: los que significan
 * "está físicamente en mi poder y libre".
 *
 * Se enumera lo PERMITIDO y no lo prohibido: si mañana se agrega un estado
 * nuevo al catálogo, quedará bloqueado hasta que alguien decida a conciencia
 * que se puede despiezar desde ahí. Es preferible a que aparezca permitido por
 * omisión.
 *
 * "Con novedad" está incluido a propósito: un equipo que llegó dañado es
 * justamente el candidato natural a despiezarse.
 */
export const ESTADOS_DESPIEZABLES = [
  "Recibido",
  "En revisión",
  "Disponible",
  "Repuesto",
  "Con novedad",
  "Destinado a partes",
  "Desarmado parcialmente",
] as const;

export type MotivoBloqueo =
  | "estado-no-apto"
  | "sin-unidades"
  | "unidades-comprometidas"
  | "ya-facturado"
  | "ya-desarmado";

export type EvaluacionDespiece =
  | { puede: true }
  | { puede: false; motivo: MotivoBloqueo; mensaje: string };

export type ItemParaDespiece = UnidadesItem & {
  estadoItem?: string | null;
  estadoDespiece?: string | null;
  tieneFacturaORecibo?: boolean;
};

/**
 * ¿Se puede abrir el despiece de este equipo? Devuelve el motivo en lenguaje
 * de negocio, no un booleano pelado: la pantalla tiene que poder explicarle a
 * la persona qué hacer para destrabarlo.
 */
export function evaluarSiSePuedeDespiezar(item: ItemParaDespiece): EvaluacionDespiece {
  const estado = (item.estadoItem ?? "").trim();

  if ((item.estadoDespiece ?? "").trim() === "Despiece completo" || estado === "Desarmado completamente") {
    return { puede: false, motivo: "ya-desarmado", mensaje: "Este equipo ya fue despiezado por completo." };
  }
  if (item.tieneFacturaORecibo) {
    return {
      puede: false,
      motivo: "ya-facturado",
      mensaje: "Este equipo ya tiene factura o recibo emitidos; no se puede desarmar.",
    };
  }
  if (!ESTADOS_DESPIEZABLES.some((e) => e === estado)) {
    return {
      puede: false,
      motivo: "estado-no-apto",
      mensaje: estado
        ? `Un equipo en estado "${estado}" no se puede despiezar todavía. Debe estar recibido y disponible.`
        : "Este equipo no tiene estado definido; no se puede despiezar.",
    };
  }
  if (normalizarUnidades(item.cantidad) < 1) {
    return { puede: false, motivo: "sin-unidades", mensaje: "Este equipo no tiene unidades en stock." };
  }
  // Se exige una unidad LIBRE: si las que hay están comprometidas con una
  // reserva o una orden, primero hay que soltarlas. Desarmar algo que un
  // cliente ya apartó dejaría esa reserva apuntando a un equipo inexistente.
  if (unidadesLibres(item) < 1) {
    return {
      puede: false,
      motivo: "unidades-comprometidas",
      mensaje:
        "Todas las unidades de este equipo están comprometidas con una reserva o una orden. Libéralas antes de despiezarlo.",
    };
  }
  return { puede: true };
}

// ─── Reparto del costo entre las piezas ──────────────────────────────────────

export type PiezaParaReparto = {
  id: string;
  /** Precio de venta por unidad. Vacío o 0 = "sin precio asignado todavía". */
  precioVenta?: number | null;
  cantidad?: number | null;
};

export type RepartoPieza = { id: string; costoAsignado: number };

export type ResultadoReparto = {
  piezas: RepartoPieza[];
  /** Costo que no se pudo repartir (queda a la vista en el pie de la tabla). */
  sinRepartir: number;
  /** Piezas que no recibieron costo por no tener precio asignado. */
  piezasSinPrecio: string[];
  /** Cómo se repartió, para poder explicarlo en pantalla. */
  criterio: "proporcional-al-precio" | "partes-iguales" | "sin-reparto";
};

function centavos(v: number): number {
  return Math.round(v * 100);
}

/**
 * Reparte el costo total del equipo entre sus piezas, proporcional a lo que se
 * espera cobrar por cada una: si la pantalla se vende a $60 y el teclado a
 * $20, la pantalla carga el 75% del costo.
 *
 * Lo que se reparte es el **costo total** del equipo (con flete y arancel
 * incluidos), no solo lo que se le pagó al proveedor: el flete que costó
 * traerlo también es parte de lo que costó.
 *
 * Decisiones deliberadas:
 *
 * - **Las piezas sin precio no reciben costo.** Darles una parte obligaría a
 *   inventarles un valor. Se devuelven en `piezasSinPrecio` y su parte queda
 *   en `sinRepartir`, visible, para que se les ponga precio y se recalcule.
 * - **Si NINGUNA pieza tiene precio**, se reparte en partes iguales por
 *   unidad. Es mejor que dejar todo el costo colgando: al menos la utilidad
 *   no queda inflada, y al poner precios el reparto se recalcula.
 * - **Se trabaja en centavos y la última pieza absorbe el redondeo**, de modo
 *   que la suma cuadre exactamente con el costo del equipo. Repartir $214
 *   entre tres piezas deja centavos sueltos que, sin esto, harían que los
 *   totales nunca cerraran.
 */
export function repartirCostoEntrePiezas(costoTotalEquipo: number, piezas: PiezaParaReparto[]): ResultadoReparto {
  const total = centavos(Math.max(0, Number.isFinite(costoTotalEquipo) ? costoTotalEquipo : 0));
  if (piezas.length === 0 || total === 0) {
    return { piezas: piezas.map((p) => ({ id: p.id, costoAsignado: 0 })), sinRepartir: total / 100, piezasSinPrecio: [], criterio: "sin-reparto" };
  }

  const conPeso = piezas.map((p) => {
    const cantidad = Math.max(1, normalizarUnidades(p.cantidad ?? 1));
    const precio = typeof p.precioVenta === "number" && p.precioVenta > 0 ? p.precioVenta : 0;
    return { id: p.id, cantidad, precio, peso: centavos(precio) * cantidad };
  });

  const pesoTotal = conPeso.reduce((s, p) => s + p.peso, 0);
  const piezasSinPrecio = conPeso.filter((p) => p.peso === 0).map((p) => p.id);

  // Nadie tiene precio: partes iguales por unidad.
  if (pesoTotal === 0) {
    const unidades = conPeso.reduce((s, p) => s + p.cantidad, 0);
    let restante = total;
    const resultado: RepartoPieza[] = conPeso.map((p, i) => {
      const parte = i === conPeso.length - 1 ? restante : Math.floor((total * p.cantidad) / unidades);
      restante -= parte;
      return { id: p.id, costoAsignado: parte / 100 };
    });
    return { piezas: resultado, sinRepartir: 0, piezasSinPrecio: [], criterio: "partes-iguales" };
  }

  const conPrecio = conPeso.filter((p) => p.peso > 0);
  let restante = total;
  const asignado = new Map<string, number>();
  conPrecio.forEach((p, i) => {
    const parte = i === conPrecio.length - 1 ? restante : Math.floor((total * p.peso) / pesoTotal);
    restante -= parte;
    asignado.set(p.id, parte);
  });

  return {
    piezas: conPeso.map((p) => ({ id: p.id, costoAsignado: (asignado.get(p.id) ?? 0) / 100 })),
    sinRepartir: 0,
    piezasSinPrecio,
    criterio: "proporcional-al-precio",
  };
}

// ─── Estados resultantes ─────────────────────────────────────────────────────

export type CierreDespiece = {
  estadoItemPadre: string;
  estadoDespiecePadre: string;
  cantidadPadre: number;
  disponibleVenta: false;
};

/**
 * Qué le queda al equipo padre al cerrar el despiece.
 *
 * Se descuenta UNA unidad: es la tercera forma legítima de reducir inventario
 * —junto a la factura y el recibo— y la única que no es una venta, porque el
 * equipo no se vendió, cambió de forma. Si el padre tenía 3 unidades, quedan 2
 * y las piezas salieron de una sola.
 *
 * `completo` distingue "aproveché todo" de "recuperé algunas piezas y el resto
 * se botó". No cambia el efecto sobre el inventario; cambia el rótulo, para
 * que al revisar el histórico se sepa qué pasó.
 */
export function calcularCierreDespiece(item: UnidadesItem, completo: boolean): CierreDespiece {
  const cantidadRestante = Math.max(0, normalizarUnidades(item.cantidad) - 1);
  return {
    estadoItemPadre: cantidadRestante > 0 ? "Desarmado parcialmente" : "Desarmado completamente",
    estadoDespiecePadre: completo ? "Despiece completo" : "Despiece parcial",
    cantidadPadre: cantidadRestante,
    disponibleVenta: false,
  };
}

/** ¿Se puede deshacer el despiece? Solo si ninguna pieza salió ya del inventario. */
export function puedeCancelarseDespiece(piezas: Array<{ estadoItem?: string | null; tieneFacturaORecibo?: boolean }>): {
  puede: boolean;
  mensaje?: string;
} {
  const vendidas = piezas.filter((p) => (p.estadoItem ?? "").trim() === "Vendido" || p.tieneFacturaORecibo);
  if (vendidas.length > 0) {
    return {
      puede: false,
      mensaje: `Ya se vendió ${vendidas.length === 1 ? "una pieza" : `${vendidas.length} piezas`} de este despiece; el equipo no puede volver a existir entero.`,
    };
  }
  return { puede: true };
}

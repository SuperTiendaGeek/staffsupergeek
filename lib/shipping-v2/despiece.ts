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

/**
 * Punto 10b (decisión 4a, 16-oct-2026): mientras el despiece no se completa,
 * las piezas existen pero no se venden ni se reservan. Este estado las marca;
 * al completar pasan a "En revisión" o "Disponible" según su categoría.
 */
export const ESTADO_PIEZA_EN_ESPERA = "Pieza en espera";

export type MotivoBloqueo =
  | "varias-unidades"
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
  // Punto 10b (3b, 16-oct): se desarma UNA unidad. Si el registro tiene
  // varias, primero se separa una (mismo SKU, sus propios costos) y se
  // desarma esa; las demás siguen a la venta.
  if (normalizarUnidades(item.cantidad) > 1) {
    return {
      puede: false,
      motivo: "varias-unidades",
      mensaje: `Este registro tiene ${normalizarUnidades(item.cantidad)} unidades. Separa una para desarmarla; las demás siguen a la venta.`,
    };
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

/** ¿Se puede cancelar el despiece EN PROCESO? (borra las piezas en espera). */
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

// ─── Revertir un despiece ya completado (decisión 5a, 16-oct-2026) ───────────

export type PiezaParaRevertir = {
  sku?: string;
  estadoItem?: string | null;
  tieneFacturaORecibo?: boolean;
  cantidadReservada?: number | null;
  /** Tiene reservas, una orden o presupuesto del técnico, o se usó en una mejora. */
  enUso?: boolean;
};

const ESTADOS_PIEZA_REVERTIBLE = new Set(["disponible", "en revision", "recibido", "pieza en espera"]);

/**
 * Solo el Administrador, y solo si ninguna pieza se vendió, reservó o usó en
 * una mejora: entonces se borran las piezas y el equipo vuelve a existir
 * entero, directo a la venta (sin inspección nueva).
 */
export function puedeRevertirseDespiece(piezas: PiezaParaRevertir[]): { puede: boolean; mensaje?: string } {
  const ocupadas = piezas.filter((p) => {
    const estado = String(p.estadoItem ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    return p.tieneFacturaORecibo === true || (p.cantidadReservada ?? 0) > 0 || p.enUso === true || !ESTADOS_PIEZA_REVERTIBLE.has(estado);
  });
  if (ocupadas.length > 0) {
    const cuales = ocupadas.map((p) => p.sku).filter(Boolean).join(", ");
    return {
      puede: false,
      mensaje: `No se puede revertir: ${ocupadas.length === 1 ? "una pieza ya" : `${ocupadas.length} piezas ya`} se vendió, reservó o usó${cuales ? ` (${cuales})` : ""}.`,
    };
  }
  return { puede: true };
}

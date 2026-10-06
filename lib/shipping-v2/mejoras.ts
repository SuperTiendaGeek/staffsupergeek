// Mejoras: poner una pieza del inventario dentro de un equipo de la tienda.
//
// ─── Regla de negocio (dueño, 6-oct-2026 · auditoría Shipping V2, punto 3) ───
//
// · La pieza se elige entre las MISMAS categorías que usa el buscador de
//   repuestos de los técnicos (CATEGORIAS_REPUESTO_STOCK). Nada más. Ya no
//   depende de la casilla oculta "Es repuesto", que ningún proceso marcaba.
// · La pieza tiene que estar en la tienda (casilla Recibido), sin novedad ni
//   veredicto de problema, no ser de Uso local (activos fijos de la tienda) y
//   tener unidades libres (lo reservado para un cliente no se toca).
// · NO hace falta que la pieza tenga su inspección firmada: el técnico la
//   prueba al instalarla.
// · El técnico elige cuántas unidades usa; el único límite son las unidades
//   libres.
// · Si la mejora consume la última unidad, la pieza queda "Agotado".
//
// Módulo puro: sin red, sin React, sin Airtable.

import { evaluarDisponibilidadComercial } from "./item-comercial";
import { unidadesLibres } from "./unidades";

function normalize(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Categorías que se pueden montar como repuesto: en una orden de reparación
 * (buscador de los técnicos) y en una mejora de un equipo de la tienda.
 */
export const CATEGORIAS_REPUESTO_STOCK = [
  "Repuesto",
  "RAM",
  "SSD",
  "HDD",
  "Pantalla",
  "Teclado",
  "Batería",
  "Cargador",
  "Mainboard",
  "Tarjeta gráfica",
  "Fuente de poder",
  "Cable",
  "Accesorio",
] as const;

const CATEGORIAS_NORMALIZADAS = new Set(CATEGORIAS_REPUESTO_STOCK.map((c) => normalize(c)));

export function esCategoriaDeRepuesto(categoria?: string | null): boolean {
  return CATEGORIAS_NORMALIZADAS.has(normalize(categoria));
}

/** Etiqueta que recibe la pieza cuando una mejora usa su última unidad. */
export const ESTADO_AGOTADO = "Agotado";

export type PiezaMejoraLike = {
  id: string;
  sku?: string | null;
  nombre?: string | null;
  categoria?: string | null;
  recibido?: boolean | null;
  estado?: string | null;
  estadoRevision?: string | null;
  usoLocal?: boolean | null;
  cantidad?: number | null;
  cantidadReservada?: number | null;
  reservado?: boolean | null;
};

export type EvaluacionPiezaMejora = { ok: true; libres: number } | { ok: false; motivo: string };

/**
 * ¿Se puede usar esta pieza en una mejora del equipo `equipoId`?
 * `cantidad` = unidades que se quieren usar (por defecto 1, solo para listar).
 */
export function evaluarPiezaParaMejora(
  pieza: PiezaMejoraLike,
  opciones: { equipoId: string; cantidad?: number }
): EvaluacionPiezaMejora {
  const nombre = pieza.sku || pieza.nombre || "La pieza";
  if (pieza.id === opciones.equipoId) return { ok: false, motivo: "Un artículo no puede usarse a sí mismo como pieza." };
  if (!esCategoriaDeRepuesto(pieza.categoria)) {
    return { ok: false, motivo: `${nombre} es de categoría "${pieza.categoria || "sin categoría"}" y no se puede usar como pieza.` };
  }
  if (pieza.recibido !== true) return { ok: false, motivo: `${nombre} todavía no está en la tienda (no tiene "Recibido").` };

  const comercial = evaluarDisponibilidadComercial({
    estado: pieza.estado,
    estadoRevision: pieza.estadoRevision,
    usoLocal: pieza.usoLocal,
  });
  if (!comercial.apartable) return { ok: false, motivo: `${nombre}: ${comercial.detalle}` };

  const libres = unidadesLibres({
    cantidad: pieza.cantidad,
    cantidadReservada: pieza.cantidadReservada,
    reservado: pieza.reservado,
  });
  const pedidas = opciones.cantidad ?? 1;
  if (!Number.isInteger(pedidas) || pedidas < 1) return { ok: false, motivo: "La cantidad debe ser un número entero mayor a 0." };
  if (libres < pedidas) {
    return { ok: false, motivo: `No hay unidades libres suficientes de ${nombre}: hay ${libres} sin apartar y se piden ${pedidas}.` };
  }
  return { ok: true, libres };
}

/** Qué escribir en la pieza después de consumir unidades. */
export function cambiosPiezaTrasConsumo(cantidadActual: number, cantidadUsada: number): {
  cantidad: number;
  agotada: boolean;
} {
  const cantidad = Math.max(0, cantidadActual - cantidadUsada);
  return { cantidad, agotada: cantidad === 0 };
}

/** Etiquetas con las que el equipo ya salió de la tienda: no se le registra nada. */
const ESTADOS_EQUIPO_FUERA = new Set([
  "vendido", "usado en reparacion", "agotado", "cancelado", "archivado",
  "desarmado completamente", "migrado",
]);

/**
 * ¿Se le puede registrar un mantenimiento o una mejora a este equipo?
 * Tiene que estar en la tienda (Recibido), con unidades y sin haber salido.
 * Una novedad abierta NO lo impide: arreglar el problema es justamente un
 * mantenimiento o una mejora.
 */
export function evaluarEquipoParaIntervencion(equipo: {
  recibido?: boolean | null;
  estado?: string | null;
  cantidad?: number | null;
}): { ok: true } | { ok: false; motivo: string } {
  if (equipo.recibido !== true) return { ok: false, motivo: "El artículo todavía no está en la tienda (falta marcar Recibido)." };
  if (ESTADOS_EQUIPO_FUERA.has(normalize(equipo.estado))) {
    return { ok: false, motivo: `El artículo ya no está en la tienda (${equipo.estado}).` };
  }
  if (!(Number(equipo.cantidad) > 0)) return { ok: false, motivo: "El artículo no tiene unidades." };
  return { ok: true };
}

// ─── Costo (dueño, 6-oct-2026) ───────────────────────────────────────────────
// · La mejora SUMA el costo de la pieza al equipo. El sistema sugiere
//   (costo por unidad de la pieza × unidades usadas) y quien registra puede
//   cambiarlo.
// · La pieza que SALE del equipo puede entrar al inventario como artículo
//   nuevo. Su valor sugerido es $0; si se escribe un valor, se RESTA del costo
//   del equipo para que la suma siga cuadrando.
// · Si el registro del equipo tiene VARIAS unidades (p. ej. 9 laptops iguales)
//   la mejora se registra pero el costo del equipo no se toca: cambiaría el de
//   las 9 y solo se mejoró una. Se avisa que conviene separar esa unidad
//   (punto 13, "rompecabezas").

const redondear = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function costoSugeridoMejora(costoUnidadPieza: number | null | undefined, cantidadUsada: number): number {
  const costo = Number(costoUnidadPieza);
  if (!Number.isFinite(costo) || costo <= 0) return 0;
  return redondear(costo * Math.max(0, cantidadUsada));
}

export type DecisionCostoMejora = {
  /** Lo que se suma al equipo por la pieza puesta. */
  costoSumado: number;
  /** Lo que se resta al equipo por la pieza retirada. */
  valorRestado: number;
  /** Cambio neto en "Costo de mejoras" del equipo. */
  ajuste: number;
  aviso?: string;
};

export function decidirCostoMejora(input: {
  cantidadEquipo: number;
  costoSumado: number | null | undefined;
  valorPiezaRetirada?: number | null;
}): DecisionCostoMejora {
  const costo = Number(input.costoSumado ?? 0);
  const valor = Number(input.valorPiezaRetirada ?? 0);
  if (!Number.isFinite(costo) || costo < 0) throw new Error("El costo a sumar no puede ser negativo.");
  if (!Number.isFinite(valor) || valor < 0) throw new Error("El valor de la pieza retirada no puede ser negativo.");
  if (input.cantidadEquipo > 1) {
    return {
      costoSumado: 0,
      valorRestado: 0,
      ajuste: 0,
      aviso: `Este registro tiene ${input.cantidadEquipo} unidades: la mejora queda registrada, pero su costo no se suma porque cambiaría el de todas. Conviene separar la unidad mejorada en un artículo propio.`,
    };
  }
  const costoSumado = redondear(costo);
  const valorRestado = redondear(valor);
  return { costoSumado, valorRestado, ajuste: redondear(costoSumado - valorRestado) };
}

export type PiezaRetiradaInput = {
  nombre: string;
  categoria: string;
  cantidad?: number;
  valor?: number | null;
};

/** Valida la pieza retirada y devuelve la nota que llevará el artículo nuevo. */
export function validarPiezaRetirada(
  pieza: PiezaRetiradaInput,
  equipo: { sku?: string | null; nombre?: string | null },
  fechaIso: string
): { nombre: string; categoria: string; cantidad: number; valor: number; nota: string } {
  const nombre = (pieza.nombre ?? "").trim();
  const categoria = (pieza.categoria ?? "").trim();
  if (!nombre) throw new Error("La pieza retirada necesita un nombre.");
  if (!categoria) throw new Error("La pieza retirada necesita una categoría (de ella sale su SKU).");
  const cantidad = pieza.cantidad ?? 1;
  if (!Number.isInteger(cantidad) || cantidad < 1) throw new Error("La cantidad de la pieza retirada debe ser un entero mayor a 0.");
  const valor = Number(pieza.valor ?? 0);
  if (!Number.isFinite(valor) || valor < 0) throw new Error("El valor de la pieza retirada no puede ser negativo.");
  const origen = equipo.sku || equipo.nombre || "otro equipo";
  return {
    nombre,
    categoria,
    cantidad,
    valor: redondear(valor),
    nota: `Retirada de ${origen} en una mejora (${fechaIso.slice(0, 10)}).`,
  };
}

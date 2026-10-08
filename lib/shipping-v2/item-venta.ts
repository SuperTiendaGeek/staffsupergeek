// ¿Se puede VENDER este artículo? (factura o recibo)
//
// ─── Regla de negocio (dueño, 3 y 4-oct-2026 · auditoría Shipping V2, punto 1) ─
//
// Reservar y vender son dos cosas distintas:
//
//   RESERVAR  se puede desde que el artículo existe, aunque todavía esté en
//             eBay o en la caja de Roberto. Lo decide item-comercial.ts
//             (evaluarDisponibilidadComercial) y se refleja en la casilla
//             "Disponible para venta", que el sistema calcula solo.
//
//   VENDER    exige, además de poder reservarse, que el artículo esté
//             físicamente en la tienda:
//               1. casilla "Recibido" marcada, y
//               2. si "Requiere inspección", la ficha de inspección técnica
//                  firmada (casilla "Revisado física/técnicamente", que SOLO
//                  se marca al firmar la ficha).
//             Fotos y publicaciones NO son requisito: son tareas publicitarias.
//
// La regla vale para TODOS los caminos de venta: mostrador, reserva, pedido de
// Operación Comercial y orden de reparación. "La factura se emite únicamente
// cuando el artículo llega y se entrega al cliente."
//
// El texto de "Estado Item" ya NO decide nada. "Disponible" es solo una
// etiqueta que el sistema pone cuando el artículo cumple esta regla
// (ver estadoSegunLlegada). Antes había un botón "Listo para vender" que
// cambiaba esa etiqueta a mano; se eliminó porque no decidía la venta.

import { evaluarDisponibilidadComercial } from "./item-comercial";

function normalize(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Categorías que por defecto requieren inspección técnica (aprobado por el
 * dueño el 4-oct-2026). Es solo el valor que propone el formulario: quien
 * registra puede cambiarlo en cada artículo.
 */
export const CATEGORIAS_CON_INSPECCION = [
  "Laptop",
  "Desktop",
  "All in One",
  "Monitor",
  "Consola",
  "Tablet",
  "Celular",
  "Impresora",
  "Mainboard",
  "Tarjeta gráfica",
  "RAM",
  "SSD",
  "HDD",
  "Disco externo",
  "Batería",
  "Pantalla",
  "Fuente de poder",
] as const;

const CATEGORIAS_CON_INSPECCION_NORMALIZADAS = new Set(CATEGORIAS_CON_INSPECCION.map((c) => normalize(c)));

/**
 * Valor inicial de "Requiere inspección" para un artículo nuevo.
 *
 * Un "Reajuste de inventario" es mercadería que ya está en la tienda y se vende
 * directo (decisión del dueño): por defecto no pide inspección, aunque su
 * categoría la pediría. Igual se puede marcar a mano.
 */
export function requiereInspeccionPorDefecto(input: { categoria?: string | null; tipoOperacion?: string | null }): boolean {
  if (normalize(input.tipoOperacion) === "reajuste de inventario") return false;
  return CATEGORIAS_CON_INSPECCION_NORMALIZADAS.has(normalize(input.categoria));
}

export type ShippingV2ItemVentaLike = {
  estado?: string | null;
  estadoRevision?: string | null;
  usoLocal?: boolean | null;
  novedadesAbiertas?: number;
  recibido?: boolean | null;
  requiereInspeccion?: boolean | null;
  /** Casilla "Revisado física/técnicamente": se marca al firmar la ficha. */
  inspeccionFirmada?: boolean | null;
};

export type MotivoNoVendible = "bloqueado" | "no-llego" | "falta-inspeccion";

export type EvaluacionVenta =
  | { vendible: true }
  | { vendible: false; motivo: MotivoNoVendible; detalle: string };

export const MENSAJE_NO_VENDIBLE: Record<Exclude<MotivoNoVendible, "bloqueado">, string> = {
  "no-llego": "todavía no llega a la tienda. Se puede reservar, pero se factura cuando llegue y se entregue",
  "falta-inspeccion": "llegó, pero falta firmar su inspección técnica",
};

export function evaluarVentaItem(item: ShippingV2ItemVentaLike): EvaluacionVenta {
  const comercial = evaluarDisponibilidadComercial({
    estado: item.estado,
    estadoRevision: item.estadoRevision,
    usoLocal: item.usoLocal,
    novedadesAbiertas: item.novedadesAbiertas,
  });
  if (!comercial.apartable) {
    return { vendible: false, motivo: "bloqueado", detalle: comercial.detalle };
  }
  if (item.recibido !== true) {
    return { vendible: false, motivo: "no-llego", detalle: MENSAJE_NO_VENDIBLE["no-llego"] };
  }
  if (item.requiereInspeccion === true && item.inspeccionFirmada !== true) {
    return { vendible: false, motivo: "falta-inspeccion", detalle: MENSAJE_NO_VENDIBLE["falta-inspeccion"] };
  }
  return { vendible: true };
}

/**
 * Etapas del camino de llegada. Solo dentro de ellas el sistema mueve la
 * etiqueta "Estado Item" por su cuenta. Reservado, Vendido, Con novedad, Uso
 * local, Repuesto y los estados finales no se tocan aquí.
 */
const ESTADOS_DEL_CAMINO = new Set([
  "registrado",
  "pendiente de pago",
  "pagado",
  "pendiente de packing",
  "en packing",
  "en transito",
  "recibido",
  "en revision",
  "disponible",
  // Punto 4 (8-oct): la etiqueta de un activo también la pone esta regla.
  "uso local",
]);

/**
 * Etiqueta que corresponde a un artículo YA RECIBIDO, o null si no hay que
 * cambiarla.
 *
 *   llegó y no requiere inspección (o ya la firmó) → "Disponible"
 *   llegó y le falta firmar la inspección           → "En revisión"
 *
 * Esto es lo que antes hacía a mano el botón "Listo para vender", y lo que
 * nunca le pasaba a lo que llegaba directo sin packing (C-1 de la auditoría):
 * se quedaba congelado en "Pagado" o "Pendiente de pago" aunque ya estuviera
 * en la tienda.
 */
export function estadoSegunLlegada(item: {
  estado?: string | null;
  recibido?: boolean | null;
  requiereInspeccion?: boolean | null;
  inspeccionFirmada?: boolean | null;
  /**
   * Activo de la tienda (casilla "Es uso local", punto 4): en vez de
   * "Disponible" su etiqueta es "Uso local". Es el ÚNICO dato que lo decide.
   */
  usoLocal?: boolean | null;
}): "Disponible" | "En revisión" | "Uso local" | null {
  if (item.recibido !== true) return null;
  const actual = normalize(item.estado);
  if (!ESTADOS_DEL_CAMINO.has(actual)) return null;
  const listo = item.usoLocal === true ? "Uso local" : "Disponible";
  const destino = item.requiereInspeccion === true && item.inspeccionFirmada !== true ? "En revisión" : listo;
  return normalize(destino) === actual ? null : destino;
}

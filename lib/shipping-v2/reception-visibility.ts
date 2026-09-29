import type { ShippingV2Item } from "@/types/shipping-v2";

type ReceptionVisibilityItem = Pick<
  ShippingV2Item,
  | "estado"
  | "estadoRevision"
  | "esRepuesto"
  | "fotosTomadas"
  | "shopifyPublicado"
  | "marketplacePublicado"
  | "mercadoLibrePublicado"
  | "gruposFacebookPublicado"
  | "facebookSuperGeek"
> & Partial<Pick<ShippingV2Item, "operacionComercialId" | "modoLogistico" | "recibido">>;

// Estados en los que un artículo ya no espera nada de Recepción.
const ESTADOS_FINALES = new Set([
  "vendido",
  "cancelado",
  "archivado",
  "destinado a partes",
  "desarmado parcialmente",
  "desarmado completamente",
]);

/**
 * Pedido de un cliente (nació de una Operación Comercial) que llega directo,
 * sin packing, y todavía no se marcó Recibido. Sin esta regla un pedido
 * "Compra ya pagada" en estado "Pagado" no aparecía en Recepción y, como la
 * factura de su orden exige que esté recibido, quedaba atascado para siempre.
 */
export function esPedidoDirectoPorRecibir(item: ReceptionVisibilityItem): boolean {
  return (
    !!item.operacionComercialId &&
    normalize(item.modoLogistico) === "tracking directo" &&
    item.recibido !== true &&
    !ESTADOS_FINALES.has(normalize(item.estado))
  );
}

function normalize(value?: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function shouldShowShippingV2ReceptionItem(item: ReceptionVisibilityItem) {
  const state = normalize(item.estado);
  const review = normalize(item.estadoRevision);
  const allowedStates = new Set(["recibido", "en revision", "con novedad", "repuesto"]);
  const allowedReviewStates = new Set([
    "pendiente de recepcion",
    "recibido pendiente de revision",
    "recibido correctamente",
    "faltante",
    "aceptado con observacion",
    "danado",
    "incompleto",
    "diferente al comprado",
    "en garantia con proveedor",
  ]);
  if (allowedStates.has(state) || allowedReviewStates.has(review) || item.esRepuesto) return true;
  if (esPedidoDirectoPorRecibir(item)) return true;
  return state === "disponible" && (
    item.fotosTomadas !== true ||
    item.shopifyPublicado !== true ||
    item.marketplacePublicado !== true ||
    item.mercadoLibrePublicado !== true ||
    item.gruposFacebookPublicado !== true ||
    item.facebookSuperGeek !== true
  );
}

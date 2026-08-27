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
>;

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
  return state === "disponible" && (
    item.fotosTomadas !== true ||
    item.shopifyPublicado !== true ||
    item.marketplacePublicado !== true ||
    item.mercadoLibrePublicado !== true ||
    item.gruposFacebookPublicado !== true ||
    item.facebookSuperGeek !== true
  );
}

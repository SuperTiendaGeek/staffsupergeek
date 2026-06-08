import { PortalShell } from "@/components/PortalShell";
import { getShippingV2AccessContextForSession, getShippingV2Items, getShippingV2Novedades, getShippingV2Packings, getShippingV2Proveedores } from "@/lib/shipping-v2/airtable";
import { getSessionFromCookie } from "@/lib/session";
import type { ShippingV2Item, ShippingV2Novedad, ShippingV2Packing, ShippingV2Proveedor } from "@/types/shipping-v2";
import { ShippingV2RecepcionClient } from "./ShippingV2RecepcionClient";

export const dynamic = "force-dynamic";

function normalize(value?: string) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function shouldShowReceptionItem(item: ShippingV2Item) {
  const state = normalize(item.estado);
  const review = normalize(item.estadoRevision);
  const allowedStates = new Set(["recibido", "en revision", "con novedad", "repuesto"]);
  const allowedReviewStates = new Set([
    "recibido pendiente de revision",
    "recibido correctamente",
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
    item.gruposFacebookPublicado !== true
  );
}

export default async function ShippingV2RecepcionPage() {
  let items: ShippingV2Item[] = [];
  let packings: ShippingV2Packing[] = [];
  let proveedores: ShippingV2Proveedor[] = [];
  let novedades: ShippingV2Novedad[] = [];
  let error = "";

  try {
    const session = await getSessionFromCookie();
    const access = await getShippingV2AccessContextForSession(session);
    const [loadedItems, loadedPackings, loadedProveedores, loadedNovedades] = await Promise.all([
      getShippingV2Items({ includeAiName: false }),
      getShippingV2Packings(access),
      getShippingV2Proveedores(),
      getShippingV2Novedades(),
    ]);
    items = loadedItems.filter(shouldShowReceptionItem);
    packings = loadedPackings;
    proveedores = !access.isAdmin && access.providerId ? loadedProveedores.filter((provider) => provider.id === access.providerId) : loadedProveedores;
    novedades = loadedNovedades;
  } catch (loadError) {
    console.error("Error al cargar recepción Shipping V2:", loadError);
    error = loadError instanceof Error ? loadError.message : "No se pudo cargar recepción.";
  }

  return (
    <PortalShell density="compact" eyebrow="Shipping V2" title="Recepción" description="Revisión y preparación comercial de items recibidos">
      <ShippingV2RecepcionClient items={items} packings={packings} proveedores={proveedores} novedades={novedades} error={error} />
    </PortalShell>
  );
}

import { ShippingV2Pestanas } from "@/components/shipping-v2/ShippingV2Pestanas";
import { redirect } from "next/navigation";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { getShippingV2AccessContextForSession, getShippingV2ArticulosSueltosEnCamino, getShippingV2Novedades, getShippingV2Packings, getShippingV2Proveedores, getShippingV2ReceptionItems } from "@/lib/shipping-v2/airtable";
import { shouldShowShippingV2ReceptionItem } from "@/lib/shipping-v2/reception-visibility";
import { getSessionFromCookie } from "@/lib/session";
import { requirePantallaVisible } from "@/lib/permissions/pantallas";
import type { ShippingV2Item, ShippingV2Novedad, ShippingV2Packing, ShippingV2Proveedor } from "@/types/shipping-v2";
import { ShippingV2RecepcionClient } from "./ShippingV2RecepcionClient";
import { ShippingV2PorLlegar } from "./ShippingV2PorLlegar";

export const dynamic = "force-dynamic";

export default async function ShippingV2RecepcionPage() {
  let items: ShippingV2Item[] = [];
  let packings: ShippingV2Packing[] = [];
  let proveedores: ShippingV2Proveedor[] = [];
  let novedades: ShippingV2Novedad[] = [];
  let sueltos: ShippingV2Item[] = [];
  let error = "";
  const session = await getSessionFromCookie();
  requirePantallaVisible(session?.user.pantallasRestringidas ?? {}, "shipping-v2", "recepcion");
  const access = await getShippingV2AccessContextForSession(session);
  if (!access.permissions.canUseRecepcion) {
    redirect("/shipping-v2/packings");
  }

  try {
    const [loadedItems, loadedPackings, loadedProveedores, loadedNovedades, loadedSueltos] = await Promise.all([
      getShippingV2ReceptionItems({ includeAiName: false, access }),
      getShippingV2Packings(access),
      getShippingV2Proveedores(),
      getShippingV2Novedades(access),
      getShippingV2ArticulosSueltosEnCamino(access).catch((sueltosError) => {
        console.error("No se pudieron cargar los artículos por llegar:", sueltosError);
        return [] as ShippingV2Item[];
      }),
    ]);
    sueltos = loadedSueltos;
    items = loadedItems.filter(shouldShowShippingV2ReceptionItem);
    packings = loadedPackings;
    proveedores = !access.isAdmin && access.providerId ? loadedProveedores.filter((provider) => provider.id === access.providerId) : loadedProveedores;
    novedades = loadedNovedades;
  } catch (loadError) {
    console.error("Error al cargar recepción Shipping V2:", loadError);
    error = loadError instanceof Error ? loadError.message : "No se pudo cargar recepción.";
  }

  return (
    <StaffAppShell activeHref="/shipping-v2/recepcion" sectionLabel="Shipping V2">
      <div className="w-full max-w-none space-y-3">
      <ShippingV2Pestanas />
      <ShippingV2PorLlegar
        cajas={packings.filter((p) => (p.estado || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === "en transito")}
        sueltos={sueltos}
        puedeRecibirCajas={access.permissions.canTransitionPackingStatus === true}
      />
      <ShippingV2RecepcionClient
        items={items}
        packings={packings}
        proveedores={proveedores}
        novedades={novedades}
        error={error}
        preferenceScope={session?.user.userId || session?.user.email || "staff"}
      />
    </div>
    </StaffAppShell>
  );
}

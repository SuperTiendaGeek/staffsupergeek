import { redirect } from "next/navigation";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { getShippingV2AccessContextForSession, getShippingV2Items, getShippingV2Novedades, getShippingV2Packings, getShippingV2Proveedores } from "@/lib/shipping-v2/airtable";
import { shouldShowShippingV2ReceptionItem } from "@/lib/shipping-v2/reception-visibility";
import { getSessionFromCookie } from "@/lib/session";
import type { ShippingV2Item, ShippingV2Novedad, ShippingV2Packing, ShippingV2Proveedor } from "@/types/shipping-v2";
import { ShippingV2RecepcionClient } from "./ShippingV2RecepcionClient";

export const dynamic = "force-dynamic";

export default async function ShippingV2RecepcionPage() {
  let items: ShippingV2Item[] = [];
  let packings: ShippingV2Packing[] = [];
  let proveedores: ShippingV2Proveedor[] = [];
  let novedades: ShippingV2Novedad[] = [];
  let error = "";
  const session = await getSessionFromCookie();
  const access = await getShippingV2AccessContextForSession(session);
  if (!access.permissions.canUseRecepcion) {
    redirect("/shipping-v2/packings");
  }

  try {
    const [loadedItems, loadedPackings, loadedProveedores, loadedNovedades] = await Promise.all([
      getShippingV2Items({ includeAiName: false, access }),
      getShippingV2Packings(access),
      getShippingV2Proveedores(),
      getShippingV2Novedades(access),
    ]);
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
      <ShippingV2RecepcionClient
        items={items}
        packings={packings}
        proveedores={proveedores}
        novedades={novedades}
        error={error}
        preferenceScope={session?.user.userId || session?.user.email || "staff"}
      />
    </StaffAppShell>
  );
}

import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { getShippingV2AccessContextForSession, getShippingV2Packings, getShippingV2Proveedores } from "@/lib/shipping-v2/airtable";
import { getSessionFromCookie } from "@/lib/session";
import type { ShippingV2Packing, ShippingV2Proveedor } from "@/types/shipping-v2";
import { ShippingV2PackingsClient } from "./ShippingV2PackingsClient";

export const dynamic = "force-dynamic";

export default async function ShippingV2PackingsPage() {
  let packings: ShippingV2Packing[] = [];
  let proveedores: ShippingV2Proveedor[] = [];
  let error = "";

  try {
    const session = await getSessionFromCookie();
    const access = await getShippingV2AccessContextForSession(session);
    [packings, proveedores] = await Promise.all([getShippingV2Packings(access), getShippingV2Proveedores()]);
    if (!access.isAdmin && access.providerId) proveedores = proveedores.filter((provider) => provider.id === access.providerId);
  } catch (loadError) {
    console.error("Error al cargar packings Shipping V2:", loadError);
    error = loadError instanceof Error ? loadError.message : "No se pudieron cargar los packings.";
  }

  return (
    <StaffAppShell activeHref="/shipping-v2/packings" sectionLabel="Shipping V2">
      <ShippingV2PackingsClient packings={packings} proveedores={proveedores} error={error} />
    </StaffAppShell>
  );
}

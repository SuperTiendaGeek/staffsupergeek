import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { getShippingV2AccessContextForSession, getShippingV2Novedades, getShippingV2Packings, getShippingV2PackingsReviewProgress, getShippingV2Proveedores } from "@/lib/shipping-v2/airtable";
import { getSessionFromCookie } from "@/lib/session";
import { requirePantallaVisible } from "@/lib/permissions/pantallas";
import type { ShippingV2AccessPermissions, ShippingV2Packing, ShippingV2PackingReviewSummary, ShippingV2Proveedor } from "@/types/shipping-v2";
import { ShippingV2PackingsClient } from "./ShippingV2PackingsClient";

export const dynamic = "force-dynamic";

export default async function ShippingV2PackingsPage() {
  let packings: ShippingV2Packing[] = [];
  let proveedores: ShippingV2Proveedor[] = [];
  let permissions: ShippingV2AccessPermissions | null = null;
  let providerName = "";
  let error = "";
  let reviewSummaries: Record<string, ShippingV2PackingReviewSummary> = {};

  const sessionForGuard = await getSessionFromCookie();
  requirePantallaVisible(sessionForGuard?.user.pantallasRestringidas ?? {}, "shipping-v2", "packings");

  try {
    const session = await getSessionFromCookie();
    const access = await getShippingV2AccessContextForSession(session);
    permissions = access.permissions;
    providerName = access.providerName || access.providerCode || "";
    [packings, proveedores] = await Promise.all([getShippingV2Packings(access), getShippingV2Proveedores()]);
    if (!access.isAdmin && access.providerId) proveedores = proveedores.filter((provider) => provider.id === access.providerId);

    // El avance de revisión es informativo: si falla, la lista se muestra
    // igual sin la columna en vez de tumbar la pantalla entera.
    try {
      // Para un proveedor, getShippingV2Novedades vuelve a leer items y
      // packings completos para filtrar por acceso: demasiado caro solo para
      // un aviso de la lista. El proveedor igual ve el avance de revisión.
      const novedades = access.isAdmin ? await getShippingV2Novedades(access) : [];
      reviewSummaries = Object.fromEntries(await getShippingV2PackingsReviewProgress(packings, novedades));
    } catch (progressError) {
      console.error("No se pudo calcular el avance de revisión de packings Shipping V2:", progressError);
    }
  } catch (loadError) {
    console.error("Error al cargar packings Shipping V2:", loadError);
    error = loadError instanceof Error ? loadError.message : "No se pudieron cargar los packings.";
  }

  return (
    <StaffAppShell activeHref="/shipping-v2/packings" sectionLabel="Shipping V2">
      <ShippingV2PackingsClient packings={packings} proveedores={proveedores} error={error} permissions={permissions} providerName={providerName} reviewSummaries={reviewSummaries} />
    </StaffAppShell>
  );
}

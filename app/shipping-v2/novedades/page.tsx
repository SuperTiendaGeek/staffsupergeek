import { redirect } from "next/navigation";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { getShippingV2AccessContextForSession, getShippingV2NovedadesPanel, getShippingV2Proveedores } from "@/lib/shipping-v2/airtable";
import { getSessionFromCookie } from "@/lib/session";
import { requirePantallaVisible } from "@/lib/permissions/pantallas";
import type { ShippingV2Novedad, ShippingV2Proveedor } from "@/types/shipping-v2";
import { ShippingV2NovedadesClient } from "./ShippingV2NovedadesClient";

export const dynamic = "force-dynamic";

export default async function ShippingV2NovedadesPage() {
  let novedades: ShippingV2Novedad[] = [];
  let proveedores: ShippingV2Proveedor[] = [];
  let error = "";

  const session = await getSessionFromCookie();
  requirePantallaVisible(session?.user.pantallasRestringidas ?? {}, "shipping-v2", "novedades");

  const access = await getShippingV2AccessContextForSession(session);
  if (!access.permissions.canViewNovedades) redirect("/shipping-v2");

  try {
    [novedades, proveedores] = await Promise.all([
      getShippingV2NovedadesPanel(access),
      getShippingV2Proveedores(),
    ]);
    if (!access.isAdmin && access.providerId) {
      proveedores = proveedores.filter((provider) => provider.id === access.providerId);
    }
  } catch (loadError) {
    console.error("Error al cargar novedades Shipping V2:", loadError);
    error = loadError instanceof Error ? loadError.message : "No se pudieron cargar las novedades.";
  }

  return (
    <StaffAppShell activeHref="/shipping-v2/novedades" sectionLabel="Shipping V2">
      <ShippingV2NovedadesClient
        novedades={novedades}
        proveedores={proveedores}
        error={error}
        isSiteAdmin={access.isSiteAdmin}
        canRespond={access.permissions.canRespondNovedades}
      />
    </StaffAppShell>
  );
}

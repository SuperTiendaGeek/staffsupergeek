import { PortalShell } from "@/components/PortalShell";
import { getShippingV2AccessContextForSession, getShippingV2Proveedores } from "@/lib/shipping-v2/airtable";
import { getSessionFromCookie } from "@/lib/session";
import type { ShippingV2Proveedor } from "@/types/shipping-v2";
import { ShippingV2NewPackingForm } from "./ShippingV2NewPackingForm";

export const dynamic = "force-dynamic";

export default async function ShippingV2NewPackingPage() {
  let proveedores: ShippingV2Proveedor[] = [];
  let error = "";

  try {
    const session = await getSessionFromCookie();
    const access = await getShippingV2AccessContextForSession(session);
    proveedores = await getShippingV2Proveedores();
    if (!access.isAdmin && access.providerId) proveedores = proveedores.filter((provider) => provider.id === access.providerId);
  } catch (loadError) {
    console.error("Error al cargar proveedores Shipping V2:", loadError);
    error = loadError instanceof Error ? loadError.message : "No se pudieron cargar proveedores.";
  }

  return (
    <PortalShell density="compact" eyebrow="Shipping V2" title="Nuevo Packing" description="Crear grupo físico de items">
      {error ? (
        <section className="mb-4 rounded-[1rem] border border-orange-300/25 bg-orange-300/10 p-4 text-orange-100">
          <p className="text-sm font-semibold uppercase tracking-normal">Airtable V2 no disponible</p>
          <p className="mt-2 text-sm leading-6 text-orange-100/85">{error}</p>
        </section>
      ) : null}
      <ShippingV2NewPackingForm proveedores={proveedores} />
    </PortalShell>
  );
}

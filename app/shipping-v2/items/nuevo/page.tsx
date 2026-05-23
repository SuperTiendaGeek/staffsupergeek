import { PortalShell } from "@/components/PortalShell";
import { getShippingV2Proveedores } from "@/lib/shipping-v2/airtable";
import type { ShippingV2Proveedor } from "@/types/shipping-v2";
import { ShippingV2NewItemForm } from "./ShippingV2NewItemForm";

export const dynamic = "force-dynamic";

export default async function ShippingV2NewItemPage() {
  let proveedores: ShippingV2Proveedor[] = [];
  let error = "";

  try {
    proveedores = await getShippingV2Proveedores();
  } catch (loadError) {
    console.error("Error al cargar proveedores de Shipping V2:", loadError);
    error = loadError instanceof Error ? loadError.message : "No se pudieron cargar proveedores.";
  }

  return (
    <PortalShell
      density="compact"
      eyebrow="Shipping V2"
      title="Nuevo Item"
      description="Crear registro manual en Shipping Items"
    >
      {error ? (
        <section className="mb-4 rounded-[1.5rem] border border-orange-300/25 bg-orange-300/10 p-5 text-orange-100">
          <p className="text-sm font-semibold uppercase tracking-normal">Airtable V2 no disponible</p>
          <p className="mt-2 text-sm leading-6 text-orange-100/85">{error}</p>
        </section>
      ) : null}
      <ShippingV2NewItemForm proveedores={proveedores} />
    </PortalShell>
  );
}

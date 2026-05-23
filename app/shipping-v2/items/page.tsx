import { PortalShell } from "@/components/PortalShell";
import { getShippingV2Items, getShippingV2Proveedores } from "@/lib/shipping-v2/airtable";
import type { ShippingV2Item, ShippingV2Proveedor } from "@/types/shipping-v2";
import { ShippingV2ItemsClient } from "./ShippingV2ItemsClient";

export const dynamic = "force-dynamic";

export default async function ShippingV2ItemsPage() {
  let items: ShippingV2Item[] = [];
  let proveedores: ShippingV2Proveedor[] = [];
  let error = "";

  try {
    [items, proveedores] = await Promise.all([getShippingV2Items(), getShippingV2Proveedores()]);
  } catch (loadError) {
    console.error("Error al cargar items de Shipping V2:", loadError);
    error = loadError instanceof Error ? loadError.message : "No se pudieron cargar los items.";
  }

  return (
    <PortalShell
      density="compact"
      eyebrow="Shipping V2"
      title="Items"
      description="Inventario principal de Shipping V2"
    >
      <ShippingV2ItemsClient items={items} proveedores={proveedores} error={error} />
    </PortalShell>
  );
}

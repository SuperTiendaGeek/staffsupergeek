import { PortalShell } from "@/components/PortalShell";
import { NewShippingItemForm } from "@/components/shipping/NewShippingItemForm";
import { ShippingNav } from "@/components/shipping/ShippingDashboard";
import { obtenerShippingProveedores } from "@/lib/shipping/airtable";

export const dynamic = "force-dynamic";

export default async function NuevoShippingItemPage() {
  let proveedores: Awaited<ReturnType<typeof obtenerShippingProveedores>> = [];
  let error = "";

  try {
    proveedores = await obtenerShippingProveedores(500);
  } catch (loadError) {
    console.error("Error al cargar proveedores para nuevo item:", loadError);
    error = loadError instanceof Error ? loadError.message : "No se pudieron cargar los proveedores.";
  }

  return (
    <PortalShell
      eyebrow="Shipping"
      title="Nuevo Item"
      description="Registro de nuevos ítems de compra, stock, pedido, repuesto o uso local."
    >
      <div className="w-full space-y-5">
        <ShippingNav />
        {error ? <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p> : null}
        {!error && proveedores.length === 0 ? (
          <p className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
            No hay proveedores disponibles para crear el item.
          </p>
        ) : null}
        <NewShippingItemForm proveedores={proveedores} />
      </div>
    </PortalShell>
  );
}

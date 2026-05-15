import { PortalShell } from "@/components/PortalShell";
import { ShippingNav } from "@/components/shipping/ShippingDashboard";
import { formatCurrencyUSD, ShippingTable } from "@/components/shipping/ShippingTable";
import { obtenerShippingProveedores } from "@/lib/shipping/airtable";

export const dynamic = "force-dynamic";

export default async function ShippingProveedoresPage() {
  let proveedores: Awaited<ReturnType<typeof obtenerShippingProveedores>> = [];
  let error = "";

  try {
    proveedores = await obtenerShippingProveedores(100);
  } catch (loadError) {
    console.error("Error al cargar proveedores de Shipping:", loadError);
    error = loadError instanceof Error ? loadError.message : "No se pudieron cargar los proveedores.";
  }

  return (
    <PortalShell eyebrow="Shipping" title="Proveedores" description="Lectura de proveedores desde Airtable.">
      <div className="w-full space-y-5">
        <ShippingNav />
        {error ? <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p> : null}
        <ShippingTable
          title="Proveedores"
          rows={proveedores}
          getRowKey={(proveedor) => proveedor.id}
          columns={[
            { key: "nombre", header: "Nombre", render: (proveedor) => proveedor.nombre },
            { key: "direccion", header: "Dirección", render: (proveedor) => proveedor.direccion || "-" },
            { key: "compras", header: "Compras Totales", align: "right", render: (proveedor) => formatCurrencyUSD(proveedor.comprasTotales) },
            { key: "items", header: "Ítems relacionados", align: "right", render: (proveedor) => proveedor.itemsRelacionados },
          ]}
        />
      </div>
    </PortalShell>
  );
}

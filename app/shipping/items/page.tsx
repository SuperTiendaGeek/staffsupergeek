import Link from "next/link";
import { PortalShell } from "@/components/PortalShell";
import { ShippingNav } from "@/components/shipping/ShippingDashboard";
import { BooleanPill, formatCurrencyUSD, ShippingTable } from "@/components/shipping/ShippingTable";
import { obtenerShippingItemsRecientes } from "@/lib/shipping/airtable";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{
    created?: string | string[];
  }>;
};

function getParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ShippingItemsPage({ searchParams }: PageProps) {
  let items: Awaited<ReturnType<typeof obtenerShippingItemsRecientes>> = [];
  let error = "";
  const params = await searchParams;
  const created = getParam(params?.created) === "1";

  try {
    items = await obtenerShippingItemsRecientes(100);
  } catch (loadError) {
    console.error("Error al cargar items de Shipping:", loadError);
    error = loadError instanceof Error ? loadError.message : "No se pudieron cargar los items.";
  }

  return (
    <PortalShell eyebrow="Shipping" title="Items" description="Lectura de ítems recientes desde Airtable.">
      <div className="w-full space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <ShippingNav />
          <Link
            href="/shipping/items/nuevo"
            className="rounded-md bg-geek-lime px-4 py-2.5 text-center text-sm font-semibold text-geek-black shadow-glow transition hover:bg-white"
          >
            + Nuevo Item
          </Link>
        </div>
        {created ? <p className="rounded-lg border border-geek-lime/30 bg-geek-lime/10 px-4 py-3 text-sm text-geek-lime">Item creado correctamente.</p> : null}
        {error ? <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p> : null}
        <ShippingTable
          title="Items"
          rows={items}
          getRowKey={(item) => item.id}
          columns={[
            { key: "codigo", header: "Código", render: (item) => item.codigo },
            { key: "item", header: "Item", render: (item) => item.item },
            { key: "categoria", header: "Categoría", render: (item) => item.categoria || "-" },
            { key: "itemPara", header: "Item Para", render: (item) => item.itemPara || "-" },
            { key: "proveedor", header: "Proveedor", render: (item) => item.proveedor || "-" },
            { key: "costo", header: "Costo Proveedor", align: "right", render: (item) => formatCurrencyUSD(item.costoProveedor) },
            { key: "precio", header: "Precio Venta", align: "right", render: (item) => formatCurrencyUSD(item.precioVenta) },
            { key: "estadoPago", header: "Estado Pago", render: (item) => item.estadoPago || "-" },
            { key: "packing", header: "Packing", render: (item) => item.packing || "-" },
            { key: "usa", header: "USA Tracking", render: (item) => item.usaTracking || "-" },
            { key: "ec", header: "EC Tracking", render: (item) => item.ecTracking || "-" },
            { key: "regalo", header: "Regalo", align: "center", render: (item) => <BooleanPill value={item.regalo} /> },
            { key: "encargo", header: "Encargo", align: "center", render: (item) => <BooleanPill value={item.encargo} /> },
          ]}
        />
      </div>
    </PortalShell>
  );
}

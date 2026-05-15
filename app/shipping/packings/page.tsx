import { PortalShell } from "@/components/PortalShell";
import { ShippingNav } from "@/components/shipping/ShippingDashboard";
import { formatCurrencyUSD, formatDate, ShippingTable } from "@/components/shipping/ShippingTable";
import { obtenerShippingPackingsRecientes } from "@/lib/shipping/airtable";

export const dynamic = "force-dynamic";

export default async function ShippingPackingsPage() {
  let packings: Awaited<ReturnType<typeof obtenerShippingPackingsRecientes>> = [];
  let error = "";

  try {
    packings = await obtenerShippingPackingsRecientes(100);
  } catch (loadError) {
    console.error("Error al cargar packings de Shipping:", loadError);
    error = loadError instanceof Error ? loadError.message : "No se pudieron cargar los packings.";
  }

  return (
    <PortalShell eyebrow="Shipping" title="Packings" description="Lectura de packings recientes desde Airtable.">
      <div className="w-full space-y-5">
        <ShippingNav />
        {error ? <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p> : null}
        <ShippingTable
          title="Packings"
          rows={packings}
          getRowKey={(packing) => packing.id}
          columns={[
            { key: "pack", header: "Pack", render: (packing) => packing.pack },
            { key: "tipo", header: "Tipo", render: (packing) => packing.tipo || "-" },
            { key: "estado", header: "Estado", render: (packing) => packing.estado || "-" },
            { key: "items", header: "Items", render: (packing) => packing.items || "-" },
            { key: "costo", header: "Costo Total Items", align: "right", render: (packing) => formatCurrencyUSD(packing.costoTotalItems) },
            { key: "peso", header: "Peso", align: "right", render: (packing) => packing.peso === null ? "-" : `${packing.peso} kg` },
            { key: "usa", header: "USA Tracking", render: (packing) => packing.usaTracking || "-" },
            { key: "ec", header: "EC Tracking", render: (packing) => packing.ecTracking || "-" },
            { key: "fechaEnvio", header: "Fecha Envío", render: (packing) => formatDate(packing.fechaEnvio) },
            { key: "arribo", header: "Arribo Estimado", render: (packing) => formatDate(packing.arriboEstimado) },
            { key: "flete", header: "Flete EC", align: "right", render: (packing) => formatCurrencyUSD(packing.fleteEc) },
            { key: "arancel", header: "Arancel", align: "right", render: (packing) => formatCurrencyUSD(packing.arancel) },
            { key: "regalos", header: "Qty Regalos", align: "right", render: (packing) => packing.qtyRegalos ?? "-" },
            { key: "encargos", header: "Qty Encargos", align: "right", render: (packing) => packing.qtyEncargos ?? "-" },
          ]}
        />
      </div>
    </PortalShell>
  );
}

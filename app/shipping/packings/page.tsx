import Link from "next/link";
import { PortalShell } from "@/components/PortalShell";
import { ShippingNav } from "@/components/shipping/ShippingDashboard";
import { formatCurrencyUSD, formatDate, ShippingTable } from "@/components/shipping/ShippingTable";
import { obtenerShippingPackingsRecientes } from "@/lib/shipping/airtable";
import { crearPackingRapidoAction } from "./actions";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{
    created?: string | string[];
    warning?: string | string[];
  }>;
};

function getParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ShippingPackingsPage({ searchParams }: PageProps) {
  let packings: Awaited<ReturnType<typeof obtenerShippingPackingsRecientes>> = [];
  let error = "";
  const params = await searchParams;
  const created = getParam(params?.created) === "1";
  const warning = getParam(params?.warning) === "1";

  try {
    packings = await obtenerShippingPackingsRecientes(100);
  } catch (loadError) {
    console.error("Error al cargar packings de Shipping:", loadError);
    error = loadError instanceof Error ? loadError.message : "No se pudieron cargar los packings.";
  }

  return (
    <PortalShell eyebrow="Shipping" title="Packings" description="Lectura de packings recientes desde Airtable.">
      <div className="w-full space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <ShippingNav />
          <form action={crearPackingRapidoAction}>
            <button
              type="submit"
              className="rounded-md bg-geek-lime px-4 py-2.5 text-center text-sm font-semibold text-geek-black shadow-glow transition hover:bg-white"
            >
              + Nuevo Packing
            </button>
          </form>
        </div>
        {warning ? (
          <p className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
            Packing creado correctamente, pero algunos campos opcionales no se guardaron.
          </p>
        ) : created ? (
          <p className="rounded-lg border border-geek-lime/30 bg-geek-lime/10 px-4 py-3 text-sm text-geek-lime">Packing creado correctamente.</p>
        ) : null}
        {error ? <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p> : null}
        <ShippingTable
          title="Packings"
          rows={packings}
          getRowKey={(packing) => packing.id}
          columns={[
            { key: "pack", header: "Pack", render: (packing) => <Link href={`/shipping/packings/${packing.id}`} className="font-semibold text-geek-lime hover:text-white">{packing.pack}</Link> },
            { key: "tipo", header: "Tipo", render: (packing) => packing.tipo || "-" },
            { key: "estado", header: "Estado", render: (packing) => packing.estado || "-" },
            { key: "items", header: "Items", render: (packing) => packing.itemCount === 1 ? "1 item" : `${packing.itemCount} items` },
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

import Link from "next/link";
import { PortalShell } from "@/components/PortalShell";
import { ShippingNav } from "@/components/shipping/ShippingDashboard";
import { ShippingPaymentsClient } from "@/components/shipping/ShippingPaymentsClient";
import { obtenerShippingPagosRecientes } from "@/lib/shipping/airtable";

export const dynamic = "force-dynamic";

export default async function ShippingPagosPage() {
  let pagos: Awaited<ReturnType<typeof obtenerShippingPagosRecientes>> = [];
  let error = "";

  try {
    pagos = await obtenerShippingPagosRecientes(100);
  } catch (loadError) {
    console.error("Error al cargar pagos de Shipping:", loadError);
    error = loadError instanceof Error ? loadError.message : "No se pudieron cargar los pagos.";
  }

  return (
    <PortalShell eyebrow="Shipping" title="Pagos" description="Lectura de pagos recientes desde Airtable.">
      <div className="w-full space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <ShippingNav />
          <Link
            href="/shipping/pagos/sincronizar"
            className="rounded-md bg-geek-lime px-4 py-2.5 text-center text-sm font-semibold text-geek-black shadow-glow transition hover:bg-white"
          >
            Preparar pagos
          </Link>
        </div>
        {error ? <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p> : null}
        <ShippingPaymentsClient pagos={pagos} />
      </div>
    </PortalShell>
  );
}

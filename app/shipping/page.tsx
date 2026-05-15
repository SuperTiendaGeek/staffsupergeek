import { PortalShell } from "@/components/PortalShell";
import { ShippingDashboard } from "@/components/shipping/ShippingDashboard";
import { obtenerShippingDashboard } from "@/lib/shipping/airtable";

export const dynamic = "force-dynamic";

export default async function ShippingPage() {
  let data: Awaited<ReturnType<typeof obtenerShippingDashboard>> | null = null;
  let error = "";

  try {
    data = await obtenerShippingDashboard();
  } catch (loadError) {
    console.error("Error al cargar Shipping:", loadError);
    error = loadError instanceof Error ? loadError.message : "No se pudo cargar Shipping.";
  }

  return (
    <PortalShell
      eyebrow="Módulo interno"
      title="Shipping"
      description="Gestión de compras, pagos, packings, envíos e importaciones."
    >
      {error ? <p className="w-full rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p> : null}
      {data ? <ShippingDashboard {...data} /> : null}
    </PortalShell>
  );
}

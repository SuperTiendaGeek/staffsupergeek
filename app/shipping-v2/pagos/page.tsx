import { PortalShell } from "@/components/PortalShell";
import { getShippingV2PagosWorkspace } from "@/lib/shipping-v2/airtable";
import type { ShippingV2PagosWorkspace } from "@/types/shipping-v2";
import { ShippingV2PagosClient } from "./ShippingV2PagosClient";

export const dynamic = "force-dynamic";

export default async function ShippingV2PagosPage() {
  let workspace: ShippingV2PagosWorkspace = {
    pagos: [],
    proveedores: [],
    itemsPendientes: [],
    porPagar: [],
    pagosPendientes: [],
    pendientes: {
      itemsSinPago: [],
      pagosPendientes: [],
    },
    pagadosSinSoporte: [],
    sinSoporte: {
      itemsPagadosSinPago: [],
      pagosIncompletos: [],
    },
    pagosCompletos: [],
    pagosRegistrados: [],
    summary: {
      totalPorPagar: 0,
      totalPagadoSinSoporte: 0,
      totalPagadoCompleto: 0,
      incompletos: 0,
      porPagarCount: 0,
      itemsSinPagoCount: 0,
      pagosPendientesCount: 0,
      pagadosSinSoporteCount: 0,
      pagosCompletosCount: 0,
    },
  };
  let error = "";

  try {
    workspace = await getShippingV2PagosWorkspace();
  } catch (loadError) {
    console.error("Error al cargar pagos Shipping V2:", loadError);
    error = loadError instanceof Error ? loadError.message : "No se pudieron cargar los pagos.";
  }

  return (
    <PortalShell density="compact" eyebrow="Shipping V2" title="Pagos Shipping V2" description="Tablero operativo de pagos, soporte y Finanzas">
      <ShippingV2PagosClient initialWorkspace={workspace} error={error} />
    </PortalShell>
  );
}

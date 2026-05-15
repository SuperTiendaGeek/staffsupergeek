import { PortalShell } from "@/components/PortalShell";
import { ShippingNav } from "@/components/shipping/ShippingDashboard";
import { BooleanPill, formatCurrencyUSD, formatDate, ShippingTable } from "@/components/shipping/ShippingTable";
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
        <ShippingNav />
        {error ? <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p> : null}
        <ShippingTable
          title="Pagos"
          rows={pagos}
          getRowKey={(pago) => pago.id}
          columns={[
            { key: "pagoId", header: "Pago ID", render: (pago) => pago.pagoId },
            { key: "total", header: "Total Pago", align: "right", render: (pago) => formatCurrencyUSD(pago.totalPago) },
            { key: "fecha", header: "Fecha de Pago Máx", render: (pago) => formatDate(pago.fechaPagoMax) },
            { key: "transaccion", header: "Transacción ID", render: (pago) => pago.transaccionId || "-" },
            { key: "proveedor", header: "Proveedor", render: (pago) => pago.proveedor || "-" },
            { key: "realizado", header: "Pago Realizado", align: "center", render: (pago) => <BooleanPill value={pago.pagoRealizado} /> },
            { key: "estado", header: "Estado de Pago", render: (pago) => pago.estadoPago || "-" },
            { key: "recargos", header: "Recargos Pago Exterior", align: "right", render: (pago) => formatCurrencyUSD(pago.recargosPagoExterior) },
          ]}
        />
      </div>
    </PortalShell>
  );
}

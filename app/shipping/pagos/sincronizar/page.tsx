import Link from "next/link";
import { PortalShell } from "@/components/PortalShell";
import { ShippingNav } from "@/components/shipping/ShippingDashboard";
import { formatCurrencyUSD, formatDate } from "@/components/shipping/ShippingTable";
import { construirPreparacionPagosShipping, SHIPPING_PAYMENTS_START_DATE } from "@/lib/shipping/airtable";
import type { ShippingPaymentPreviewGroup, ShippingPendingPaymentItem } from "@/types/shipping";

export const dynamic = "force-dynamic";

function SuggestedStatusPill() {
  return <span className="inline-flex rounded-md border border-geek-lime/30 bg-geek-lime/10 px-2.5 py-1 text-xs font-semibold text-geek-lime">Grupo nuevo sugerido</span>;
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#181818] p-4 shadow-2xl shadow-black/20">
      <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
      <p className="mt-1 text-xs font-semibold uppercase tracking-normal text-zinc-500">{label}</p>
    </div>
  );
}

function CompactItemsList({ items, emptyLabel }: { items: ShippingPendingPaymentItem[]; emptyLabel: string }) {
  if (!items.length) return <p className="rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-500">{emptyLabel}</p>;

  return (
    <div className="divide-y divide-white/10 overflow-hidden rounded-md border border-white/10 bg-black/20">
      {items.slice(0, 8).map((item) => (
        <div key={item.id} className="grid gap-2 px-3 py-2 text-sm text-zinc-300 sm:grid-cols-[120px_1fr_110px] sm:items-center">
          <span className="font-semibold text-zinc-100">{item.codigo}</span>
          <span className="min-w-0 truncate">{item.item}</span>
          <span className="text-left font-semibold tabular-nums text-zinc-100 sm:text-right">{formatCurrencyUSD(item.costoProveedor)}</span>
        </div>
      ))}
      {items.length > 8 ? <p className="px-3 py-2 text-xs text-zinc-500">+ {items.length - 8} items adicionales.</p> : null}
    </div>
  );
}

function SuggestedGroupCard({ group }: { group: ShippingPaymentPreviewGroup }) {
  const itemsSinCosto = group.items.filter((item) => !item.regalo && item.costoProveedor === null);

  return (
    <section className="overflow-hidden rounded-lg border border-white/10 bg-[#181818] shadow-2xl shadow-black/20">
      <div className="border-b border-white/10 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="break-all text-lg font-semibold text-white">{group.pagoId}</h3>
              <SuggestedStatusPill />
            </div>
            <dl className="grid gap-2 text-sm text-zinc-400 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-xs uppercase text-zinc-600">Proveedor</dt>
                <dd className="font-semibold text-zinc-200">{group.proveedor}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-zinc-600">Fecha del grupo</dt>
                <dd className="font-semibold text-zinc-200">{group.fechaGrupoLabel}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-zinc-600">Items con costo</dt>
                <dd className="font-semibold text-zinc-200 tabular-nums">{group.itemConCostoCount}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-zinc-600">Regalos incluidos</dt>
                <dd className="font-semibold text-zinc-200 tabular-nums">{group.regaloCount}</dd>
              </div>
            </dl>
          </div>
          <div className="rounded-md border border-geek-lime/30 bg-geek-lime/10 px-4 py-3 text-left lg:min-w-[180px] lg:text-right">
            <p className="text-xs uppercase text-geek-lime/80">Total a pagar</p>
            <p className="text-xl font-bold text-geek-lime tabular-nums">{formatCurrencyUSD(group.totalCostoProveedor)}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-2">
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-white">Items con costo</h4>
          <CompactItemsList items={group.itemsConCosto} emptyLabel="No hay items con costo en este grupo." />
          {itemsSinCosto.length ? <p className="text-xs text-amber-100">{itemsSinCosto.length} item(s) sin costo registrado quedan visibles para revisión.</p> : null}
        </div>
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-white">Regalos incluidos</h4>
          <p className="text-xs text-zinc-500">Los regalos se incluyen para control del proveedor, pero no aumentan el total a pagar.</p>
          <CompactItemsList items={group.regalos} emptyLabel="No hay regalos en este grupo." />
        </div>
      </div>
    </section>
  );
}

export default async function PrepararPagosShippingPage() {
  let preview: Awaited<ReturnType<typeof construirPreparacionPagosShipping>> | null = null;
  let error = "";

  try {
    preview = await construirPreparacionPagosShipping();
  } catch (loadError) {
    console.error("Error al preparar vista previa de pagos Shipping:", loadError);
    error = loadError instanceof Error ? loadError.message : "No se pudo preparar la vista previa.";
  }

  const grupos = preview?.gruposNuevosSugeridos ?? [];
  const pagosPendientes = preview?.pagosExistentesPendientes ?? [];
  const antiguos = preview?.itemsAntiguosPorRevisar ?? [];
  const itemsNuevosPendientes = grupos.reduce((sum, group) => sum + group.items.length, 0);
  const regalosIncluidos = grupos.reduce((sum, group) => sum + group.regaloCount, 0);
  const totalSugerido = grupos.reduce((sum, group) => sum + group.totalCostoProveedor, 0);

  return (
    <PortalShell
      eyebrow="Shipping"
      title="Preparar pagos a proveedores"
      description="Revisa los ítems registrados y agrúpalos por proveedor antes de registrar el pago real."
    >
      <div className="w-full space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <ShippingNav />
          <Link href="/shipping/pagos" className="rounded-md border border-white/10 px-4 py-2.5 text-center text-sm font-semibold text-zinc-200 transition hover:border-geek-lime/50 hover:text-geek-lime">
            Volver a pagos
          </Link>
        </div>

        {error ? <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p> : null}

        {!error ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <MetricCard label="Grupos nuevos sugeridos" value={grupos.length} />
              <MetricCard label="Items nuevos pendientes" value={itemsNuevosPendientes} />
              <MetricCard label="Regalos incluidos" value={regalosIncluidos} />
              <MetricCard label="Total sugerido a pagar" value={formatCurrencyUSD(totalSugerido)} />
              <MetricCard label="Items antiguos por revisar" value={antiguos.length} />
              <MetricCard label="Pagos existentes pendientes" value={pagosPendientes.length} />
            </section>

            <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">Preparación sin escritura</h2>
                  <p className="text-sm text-zinc-500">Inicio del nuevo flujo: {SHIPPING_PAYMENTS_START_DATE}. La creación real de pagos sigue deshabilitada.</p>
                </div>
                <button type="button" disabled className="w-fit rounded-md border border-white/10 bg-black/20 px-4 py-2.5 text-sm font-semibold text-zinc-500 opacity-75">
                  Crear grupos de pago
                </button>
              </div>
            </section>

            <section className="space-y-3">
              <div>
                <h2 className="text-xl font-semibold text-white">Grupos nuevos sugeridos</h2>
                <p className="text-sm text-zinc-500">Ítems sin pago vinculado, no pagados y registrados desde el inicio del nuevo flujo.</p>
              </div>
              {grupos.length ? (
                <div className="space-y-4">{grupos.map((group) => <SuggestedGroupCard key={group.key} group={group} />)}</div>
              ) : (
                <div className="rounded-lg border border-white/10 bg-[#181818] px-4 py-8 text-center text-sm text-zinc-500">No hay grupos nuevos sugeridos.</div>
              )}
            </section>

            <section className="space-y-3">
              <div>
                <h2 className="text-xl font-semibold text-white">Pagos existentes pendientes</h2>
                <p className="text-sm text-zinc-500">Registros de Pago que todavía no están marcados como pagados.</p>
              </div>
              <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#181818]">
                <table className="min-w-full divide-y divide-white/10 text-left text-sm">
                  <thead className="bg-white/[0.035] text-xs uppercase tracking-normal text-zinc-500">
                    <tr>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold">Pago ID</th>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold">Proveedor</th>
                      <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">Total</th>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold">Fecha</th>
                      <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">Items</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10 text-zinc-300">
                    {pagosPendientes.length ? (
                      pagosPendientes.map((pago) => (
                        <tr key={pago.id} className="transition hover:bg-white/[0.035]">
                          <td className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-100">{pago.pagoId}</td>
                          <td className="whitespace-nowrap px-4 py-3">{pago.proveedor || "-"}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-right">{formatCurrencyUSD(pago.totalPago)}</td>
                          <td className="whitespace-nowrap px-4 py-3">{formatDate(pago.fechaPagoMax)}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{pago.itemCount}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                          No hay pagos existentes pendientes.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="space-y-3">
              <div className="rounded-lg border border-amber-300/20 bg-amber-300/10 p-4">
                <h2 className="text-xl font-semibold text-amber-100">Ítems antiguos o por revisar</h2>
                <p className="mt-1 text-sm text-amber-100/80">Estos ítems requieren revisión manual antes de agruparlos.</p>
              </div>
              <CompactItemsList items={antiguos} emptyLabel="No hay ítems antiguos por revisar." />
            </section>
          </>
        ) : null}
      </div>
    </PortalShell>
  );
}

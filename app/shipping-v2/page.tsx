import Link from "next/link";
import { PortalShell } from "@/components/PortalShell";
import { getShippingV2DashboardSummary } from "@/lib/shipping-v2/airtable";
import type { ShippingV2DashboardSummary } from "@/types/shipping-v2";

export const dynamic = "force-dynamic";

const emptySummary: ShippingV2DashboardSummary = {
  totalItems: 0,
  itemsPendientesPago: 0,
  itemsEnTransito: 0,
  itemsDisponibles: 0,
  pagosPendientes: 0,
  packingsEnProceso: 0,
  packingsEnTransito: 0,
  novedadesAbiertas: 0,
};

const kpiLabels: Array<{ key: keyof ShippingV2DashboardSummary; label: string; tone: "lime" | "purple" | "orange" | "yellow" }> = [
  { key: "totalItems", label: "Items totales", tone: "lime" },
  { key: "itemsPendientesPago", label: "Items pendientes de pago", tone: "orange" },
  { key: "itemsEnTransito", label: "Items en transito", tone: "purple" },
  { key: "itemsDisponibles", label: "Items disponibles", tone: "lime" },
  { key: "pagosPendientes", label: "Pagos pendientes", tone: "yellow" },
  { key: "packingsEnProceso", label: "Packings en proceso", tone: "orange" },
  { key: "packingsEnTransito", label: "Packings en transito", tone: "purple" },
  { key: "novedadesAbiertas", label: "Novedades abiertas", tone: "yellow" },
];

const quickAccess = [
  { label: "Items", href: "/shipping-v2/items", active: true },
  { label: "Pagos", href: null, active: false },
  { label: "Packings", href: null, active: false },
  { label: "Recepcion", href: null, active: false },
  { label: "Novedades", href: null, active: false },
  { label: "Proveedores", href: null, active: false },
];

const toneStyles = {
  lime: "border-[#D7FF4F]/35 bg-[#D7FF4F]/10 text-[#D7FF4F]",
  purple: "border-violet-300/25 bg-violet-300/10 text-violet-200",
  orange: "border-orange-300/25 bg-orange-300/10 text-orange-200",
  yellow: "border-yellow-300/25 bg-yellow-300/10 text-yellow-100",
};

function KpiCard({ label, value, tone }: { label: string; value: number; tone: keyof typeof toneStyles }) {
  return (
    <article className="rounded-[1.75rem] border border-[#3A3A36] bg-[#2A2A28] p-5 shadow-2xl shadow-black/20">
      <div className={`mb-8 h-2 w-12 rounded-full ${toneStyles[tone]}`} />
      <p className="text-4xl font-semibold tracking-normal text-[#F5F5F5] tabular-nums">{value}</p>
      <p className="mt-2 text-sm font-medium text-[#A7A7A7]">{label}</p>
    </article>
  );
}

export default async function ShippingV2Page() {
  let summary = emptySummary;
  let error = "";

  try {
    summary = await getShippingV2DashboardSummary();
  } catch (loadError) {
    console.error("Error al cargar Shipping V2:", loadError);
    error = loadError instanceof Error ? loadError.message : "No se pudo cargar Shipping V2.";
  }

  return (
    <PortalShell
      eyebrow="Modulo interno"
      title="Shipping V2"
      description="Control de inventario, pagos, packings y recepcion"
    >
      <div className="w-full space-y-6 rounded-[2rem] border border-[#3A3A36] bg-[#1B1B1B] p-4 shadow-2xl shadow-black/30 sm:p-6">
        {error ? (
          <section className="rounded-[1.5rem] border border-orange-300/25 bg-orange-300/10 p-5 text-orange-100">
            <p className="text-sm font-semibold uppercase tracking-normal">Airtable V2 no disponible</p>
            <p className="mt-2 text-sm leading-6 text-orange-100/85">{error}</p>
          </section>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpiLabels.map((item) => (
            <KpiCard key={item.key} label={item.label} value={summary[item.key]} tone={item.tone} />
          ))}
        </section>

        <section className="rounded-[1.75rem] border border-[#3A3A36] bg-[#2F2F2C] p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-[#F5F5F5]">Accesos rapidos</h2>
              <p className="mt-1 text-sm text-[#A7A7A7]">Areas preparadas para la siguiente fase de Shipping V2.</p>
            </div>
            <span className="w-fit rounded-full border border-[#D7FF4F]/35 bg-[#D7FF4F]/10 px-4 py-2 text-xs font-semibold uppercase tracking-normal text-[#D7FF4F]">
              Read-only
            </span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {quickAccess.map((item) => (
              item.href ? (
                <Link
                  key={item.label}
                  href={item.href}
                  className="rounded-full border border-[#D7FF4F]/35 bg-[#D7FF4F]/10 px-5 py-4 text-sm font-semibold text-[#D7FF4F] transition hover:bg-[#D7FF4F] hover:text-[#1B1B1B]"
                >
                  {item.label}
                </Link>
              ) : (
                <div
                  key={item.label}
                  className="rounded-full border border-[#3A3A36] bg-[#1E1E1E] px-5 py-4 text-sm font-semibold text-[#F5F5F5]"
                >
                  {item.label}
                </div>
              )
            ))}
          </div>
        </section>
      </div>
    </PortalShell>
  );
}

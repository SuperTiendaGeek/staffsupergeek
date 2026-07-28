import Link from "next/link";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { StaffStatCard } from "@/components/staff/StaffDesignSystem";
import { getShippingV2AccessContextForSession, getShippingV2DashboardSummary } from "@/lib/shipping-v2/airtable";
import { getSessionFromCookie } from "@/lib/session";
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

const staffQuickAccess = [
  { label: "Items", href: "/shipping-v2/items", active: true },
  { label: "Pagos", href: "/shipping-v2/pagos", active: true },
  { label: "Packings", href: "/shipping-v2/packings", active: true },
  { label: "Recepcion", href: "/shipping-v2/recepcion", active: true },
  { label: "Novedades", href: null, active: false },
  { label: "Proveedores", href: null, active: false },
];

const providerQuickAccess = [
  { label: "Items", href: "/shipping-v2/items", active: true },
  { label: "Packings", href: "/shipping-v2/packings", active: true },
  { label: "Pagos", href: "/shipping-v2/pagos", active: true },
  { label: "Novedades / garantías", href: null, active: false },
];

const toneStyles = {
  lime: "border-[#D7FF4F]/35 bg-[#D7FF4F]/10 text-[#D7FF4F]",
  purple: "border-violet-300/25 bg-violet-300/10 text-violet-200",
  orange: "border-orange-300/25 bg-orange-300/10 text-orange-200",
  yellow: "border-yellow-300/25 bg-yellow-300/10 text-yellow-100",
};

function KpiCard({ label, value, tone }: { label: string; value: number; tone: keyof typeof toneStyles }) {
  return <StaffStatCard label={label} value={value} tone={tone} density="compact" />;
}

export default async function ShippingV2Page() {
  let summary = emptySummary;
  let error = "";
  let isProviderPortal = false;
  let providerName = "";

  try {
    const session = await getSessionFromCookie();
    const access = await getShippingV2AccessContextForSession(session);
    isProviderPortal = access.mode === "provider";
    providerName = access.providerName || access.providerCode || "";
    summary = await getShippingV2DashboardSummary(access);
  } catch (loadError) {
    console.error("Error al cargar Shipping V2:", loadError);
    error = loadError instanceof Error ? loadError.message : "No se pudo cargar Shipping V2.";
  }

  return (
    <StaffAppShell activeHref="/shipping-v2" sectionLabel="Shipping V2">
      <div className="w-full space-y-3">
        {error ? (
          <section className="rounded-xl border border-orange-300/25 bg-orange-300/10 px-3 py-2.5 text-orange-100">
            <p className="text-sm font-semibold uppercase tracking-normal">Airtable V2 no disponible</p>
            <p className="mt-1 text-sm leading-5 text-orange-100/85">{error}</p>
          </section>
        ) : null}

        <section className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
          {kpiLabels.map((item) => (
            <KpiCard key={item.key} label={item.label} value={summary[item.key]} tone={item.tone} />
          ))}
        </section>

        <section className="rounded-xl border border-[#30312D] bg-[#151613] px-3 py-2 shadow-xl shadow-black/15">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-[#F5F5F5]">Accesos rapidos</h2>
              <p className="mt-0.5 text-sm text-[#A7A7A7]">
                {isProviderPortal && providerName ? `Portal operativo de ${providerName}.` : "Areas preparadas para la siguiente fase de Shipping V2."}
              </p>
            </div>
            <span className="w-fit rounded-full border border-[#D7FF4F]/35 bg-[#D7FF4F]/10 px-3 py-1 text-[12px] font-semibold uppercase tracking-normal text-[#D7FF4F]">
              {isProviderPortal ? "Proveedor" : "Read-only"}
            </span>
          </div>

          <div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
            {(isProviderPortal ? providerQuickAccess : staffQuickAccess).map((item) => (
              item.href ? (
                <Link
                  key={item.label}
                  href={item.href}
                  className="rounded-lg border border-[#D7FF4F]/35 bg-[#D7FF4F]/10 px-3 py-2 text-sm font-semibold text-[#D7FF4F] transition hover:bg-[#D7FF4F] hover:text-[#1B1B1B]"
                >
                  {item.label}
                </Link>
              ) : (
                <div
                  key={item.label}
                  className="rounded-lg border border-[#3A3A36] bg-[#1E1E1E] px-3 py-2 text-sm font-semibold text-[#F5F5F5]"
                >
                  {item.label}
                </div>
              )
            ))}
          </div>
        </section>
      </div>
    </StaffAppShell>
  );
}

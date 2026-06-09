import { redirect } from "next/navigation";
import { PortalShell } from "@/components/PortalShell";
import { getAirtableUsageReport, type AirtableUsageLevel } from "@/lib/admin/airtable-usage";
import { getAdminSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const levelLabels: Record<AirtableUsageLevel, string> = {
  normal: "Normal",
  warning: "Advertencia",
  risk: "Riesgo",
  critical: "Crítico",
};

const levelClass: Record<AirtableUsageLevel, string> = {
  normal: "border-[#D7FF4F]/35 bg-[#D7FF4F]/10 text-[#E9FF9A]",
  warning: "border-[#FFD54F]/35 bg-[#FFD54F]/10 text-[#FFE08A]",
  risk: "border-[#FF914D]/35 bg-[#FF914D]/10 text-[#FFB07A]",
  critical: "border-[#FF4D6D]/40 bg-[#FF4D6D]/10 text-[#FF9AAD]",
};

const progressClass: Record<AirtableUsageLevel, string> = {
  normal: "bg-[#D7FF4F]",
  warning: "bg-[#FFD54F]",
  risk: "bg-[#FF914D]",
  critical: "bg-[#FF4D6D]",
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-EC").format(value);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-EC", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function LevelBadge({ level }: { level: AirtableUsageLevel }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-bold uppercase tracking-normal ${levelClass[level]}`}>
      {levelLabels[level]}
    </span>
  );
}

export default async function AirtableUsagePage() {
  const session = await getAdminSession();
  if (!session) redirect("/acceso-denegado");

  const report = await getAirtableUsageReport();
  const progressWidth = `${Math.min(100, Math.max(0, report.percentageUsed)).toFixed(2)}%`;

  return (
    <PortalShell
      eyebrow="Administración"
      title="Uso de Airtable"
      description="Monitoreo interno de records acumulados para evitar llegar al límite del plan Team."
      activeHref="/admin/airtable-usage"
    >
      <div className="space-y-3">
        <section className="rounded-xl border border-[#30312D] bg-[#151613] p-4 shadow-xl shadow-black/20">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <LevelBadge level={report.level} />
                <span className="text-xs font-semibold text-[#A7A7A7]">Base {report.baseId}</span>
              </div>
              <p className="mt-3 text-3xl font-bold text-white">{formatNumber(report.totalRecords)}</p>
              <p className="mt-1 text-sm text-[#A7A7A7]">
                de {formatNumber(report.limit)} records permitidos · {formatPercent(report.percentageUsed)} usado
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              <div className="rounded-lg border border-[#30312D] bg-[#101010] px-3 py-2">
                <p className="text-xs text-[#A7A7A7]">Tablas</p>
                <p className="mt-1 text-lg font-bold text-white">{formatNumber(report.tables.length)}</p>
              </div>
              <div className="rounded-lg border border-[#30312D] bg-[#101010] px-3 py-2">
                <p className="text-xs text-[#A7A7A7]">Límite</p>
                <p className="mt-1 text-lg font-bold text-white">{formatNumber(report.limit)}</p>
              </div>
              <div className="rounded-lg border border-[#30312D] bg-[#101010] px-3 py-2">
                <p className="text-xs text-[#A7A7A7]">Actualizado</p>
                <p className="mt-1 text-sm font-bold text-white">{formatDate(report.generatedAt)}</p>
              </div>
            </div>
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-[#252622]">
            <div className={`h-full rounded-full ${progressClass[report.level]}`} style={{ width: progressWidth }} />
          </div>
          <div className="mt-2 flex justify-between text-[11px] font-semibold text-[#6E6F68]">
            <span>0</span>
            <span>60%</span>
            <span>75%</span>
            <span>90%</span>
            <span>50,000</span>
          </div>
        </section>

        {report.alerts.length ? (
          <section className="rounded-xl border border-[#FF914D]/35 bg-[#FF914D]/10 p-4">
            <h2 className="text-sm font-bold uppercase tracking-normal text-[#FFB07A]">Alertas de crecimiento</h2>
            <ul className="mt-2 space-y-1 text-sm text-[#FFD0B5]">
              {report.alerts.map((alert) => <li key={alert}>{alert}</li>)}
            </ul>
          </section>
        ) : null}

        {report.errors.length ? (
          <section className="rounded-xl border border-[#FF4D6D]/35 bg-[#FF4D6D]/10 p-4">
            <h2 className="text-sm font-bold uppercase tracking-normal text-[#FF9AAD]">Tablas no disponibles o con error</h2>
            <ul className="mt-2 space-y-1 text-sm text-[#FFC2CC]">
              {report.errors.map((error) => <li key={error}>{error}</li>)}
            </ul>
          </section>
        ) : null}

        <section className="overflow-hidden rounded-xl border border-[#30312D] bg-[#11120F]">
          <div className="border-b border-[#30312D] px-4 py-3">
            <h2 className="text-sm font-bold uppercase tracking-normal text-white">Records por tabla</h2>
            <p className="mt-1 text-xs text-[#A7A7A7]">Ordenado de mayor a menor cantidad de records.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[#30312D] text-sm">
              <thead className="bg-[#151613] text-left text-xs uppercase tracking-normal text-[#A7A7A7]">
                <tr>
                  <th className="px-4 py-3 font-bold">Tabla</th>
                  <th className="px-4 py-3 text-right font-bold">Records</th>
                  <th className="px-4 py-3 text-right font-bold">% del límite</th>
                  <th className="px-4 py-3 font-bold">Estado</th>
                  <th className="px-4 py-3 text-right font-bold">Últimos 7 días</th>
                  <th className="px-4 py-3 text-right font-bold">Proyección 30 días</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#252622]">
                {report.tables.map((table) => (
                  <tr key={table.name} className="text-[#F5F5F5]">
                    <td className="px-4 py-3">
                      <div className="font-semibold">{table.name}</div>
                      {table.growthAlert ? <div className="mt-1 text-xs text-[#FFB07A]">{table.growthAlert}</div> : null}
                      {table.error ? <div className="mt-1 text-xs text-[#FF9AAD]">{table.error}</div> : null}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{formatNumber(table.recordCount)}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatPercent(table.percentageOfLimit)}</td>
                    <td className="px-4 py-3"><LevelBadge level={table.level} /></td>
                    <td className="px-4 py-3 text-right font-mono text-[#A7A7A7]">
                      {table.recent7DayCount === null ? "-" : formatNumber(table.recent7DayCount)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[#A7A7A7]">
                      {table.projected30DayCount === null ? "-" : formatNumber(table.projected30DayCount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </PortalShell>
  );
}

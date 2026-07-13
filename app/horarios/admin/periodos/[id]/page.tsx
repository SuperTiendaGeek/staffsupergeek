import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AnularPagoHorarioButton } from "@/components/horarios/AnularPagoHorarioButton";
import { HorarioAjustesPeriodoClient } from "@/components/horarios/HorarioAjustesPeriodoClient";
import { HorarioPeriodoRegistrosClient, type HorarioPeriodoRegistroItem } from "@/components/horarios/HorarioPeriodoRegistrosClient";
import { HorarioPeriodoPagoClient } from "@/components/horarios/HorarioPeriodoPagoClient";
import { RolPagoPeriodoClient } from "@/components/horarios/RolPagoPeriodoClient";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { isAdministratorRole } from "@/lib/apps";
import { fetchPeriodoPagoById, fetchRegistrosAdminByEmpleadoAndRango } from "@/lib/horarios/airtable";
import { getSessionFromCookie } from "@/lib/session";
import type { HorarioPeriodoPagoDetalle, HorarioRegistro } from "@/types/horarios";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD"
  }).format(value);
}

function formatHours(value: number) {
  return `${value.toFixed(2)} h`;
}

function statusClasses(status: string) {
  if (status === "Pagado" || status === "Finalizado" || status === "Revisado") {
    return "border-[#D7FF4F]/30 bg-[#D7FF4F]/10 text-[#D7FF4F]";
  }

  if (status === "Parcialmente pagado") {
    return "border-amber-300/30 bg-amber-300/10 text-amber-100";
  }

  return "border-[#3A3A36] bg-[#2D2E2A] text-[#CFCFCB]";
}

function pagoStatusClasses(estado: string) {
  if (estado === "Anulado") return "border-red-400/30 bg-red-400/10 text-red-200";
  return "border-[#D7FF4F]/30 bg-[#D7FF4F]/10 text-[#D7FF4F]";
}

function sortRegistrosByDate(first: HorarioRegistro, second: HorarioRegistro) {
  const dateCompare = first.fecha.localeCompare(second.fecha);

  if (dateCompare !== 0) {
    return dateCompare;
  }

  const timeCompare = (first.entrada || "").localeCompare(second.entrada || "");

  if (timeCompare !== 0) {
    return timeCompare;
  }

  return first.id.localeCompare(second.id);
}

function buildPeriodoRegistrosVista(
  periodo: HorarioPeriodoPagoDetalle,
  registrosRango: HorarioRegistro[]
): HorarioPeriodoRegistroItem[] {
  const linkedIds = new Set(periodo.registroIds);
  const registrosById = new Map<string, HorarioRegistro>();

  periodo.registros.forEach((registro) => registrosById.set(registro.id, registro));
  registrosRango.forEach((registro) => registrosById.set(registro.id, registro));

  return Array.from(registrosById.values())
    .sort(sortRegistrosByDate)
    .map((registro) => ({
      ...registro,
      incluidoEnPeriodo: linkedIds.has(registro.id)
    }));
}

function PeriodoMetricCard({
  label,
  value,
  helper,
  accent = false,
  warn = false
}: {
  label: string;
  value: string;
  helper?: string;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-3 py-2.5 ${
        accent
          ? "border-[#D7FF4F]/30 bg-[#D7FF4F]/5"
          : warn
            ? "border-amber-400/25 bg-amber-400/5"
            : "border-[#3A3A36] bg-[#252622]"
      }`}
    >
      <p className="text-[11px] font-bold uppercase tracking-wide text-[#8F908A]">{label}</p>
      <p
        className={`mt-0.5 text-xl font-semibold tabular-nums ${
          accent ? "text-[#D7FF4F]" : warn ? "text-amber-200" : "text-[#F5F5F5]"
        }`}
      >
        {value}
      </p>
      {helper ? <p className="mt-1 text-[10px] leading-tight text-[#8F908A]">{helper}</p> : null}
    </div>
  );
}

export default async function HorarioPeriodoPagoPage({ params }: PageProps) {
  const session = await getSessionFromCookie();

  if (!session) {
    redirect("/login");
  }

  if (!isAdministratorRole(session.user.rol)) {
    redirect("/acceso-denegado");
  }

  const { id } = await params;
  const periodo = await fetchPeriodoPagoById(id);

  if (!periodo) {
    notFound();
  }

  const registrosRango = await fetchRegistrosAdminByEmpleadoAndRango(
    periodo.fechaInicio,
    periodo.fechaFin,
    periodo.empleadoRecordId
  ).catch((error) => {
    console.warn(`No se pudieron cargar las jornadas del rango del periodo ${periodo.id}:`, error);
    return [];
  });
  const registrosVista = buildPeriodoRegistrosVista(periodo, registrosRango);
  const returnTo = `/horarios/admin/periodos/${periodo.id}`;

  return (
    <StaffAppShell activeHref="/horarios" sectionLabel="Horarios">
      <section className="w-full space-y-3 text-left">
        {/* Top bar: regreso + acción de pago */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/horarios/admin"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#CFCFCB] transition hover:text-[#D7FF4F]"
          >
            ← Volver a horarios y pagos
          </Link>
          <HorarioPeriodoPagoClient periodoId={periodo.id} />
        </div>

        {/* Header: empleado + estado */}
        <section className="rounded-[1rem] border border-[#3A3A36] bg-[#252622] p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#8F908A]">Periodo de pago</p>
              <h2 className="mt-0.5 text-xl font-semibold text-[#F5F5F5]">{periodo.empleado}</h2>
              <p className="mt-0.5 text-sm text-[#A7A7A7]">{periodo.correo || periodo.usuarioId}</p>
              <p className="mt-2 text-sm text-[#CFCFCB]">
                {periodo.fechaInicio}
                <span className="mx-1.5 text-[#8F908A]">→</span>
                {periodo.fechaFin}
              </p>
            </div>
            <span className={`inline-flex h-fit w-fit rounded-full border px-3 py-1 text-xs font-semibold ${statusClasses(periodo.estadoPeriodo)}`}>
              {periodo.estadoPeriodo}
            </span>
          </div>
        </section>

        {/* Métricas del periodo */}
        <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
          <PeriodoMetricCard
            label="Total horas"
            value={formatHours(periodo.totalHoras)}
            helper="Horas trabajadas en el periodo"
          />
          <PeriodoMetricCard
            label="Total ganado"
            value={formatMoney(periodo.totalGanado)}
            helper="Suma de totales diarios registrados"
          />
          <PeriodoMetricCard
            label="Total ajustes"
            value={formatMoney(periodo.totalAjustes)}
            helper="Bonificaciones o descuentos aplicados"
            warn={periodo.totalAjustes < 0}
          />
          <PeriodoMetricCard
            label="Total neto"
            value={formatMoney(periodo.totalNeto)}
            helper="Total ganado más ajustes"
          />
          <PeriodoMetricCard
            label="Total pagado"
            value={formatMoney(periodo.totalPagado)}
            helper="Suma de pagos activos registrados"
          />
          <PeriodoMetricCard
            label="Saldo pendiente"
            value={formatMoney(periodo.saldoPendienteNeto)}
            helper="Total neto menos total pagado"
            accent={periodo.saldoPendienteNeto > 0}
          />
        </div>

        {/* Acciones: rol de pago y ajustes (componentes hijos sin tocar) */}
        <RolPagoPeriodoClient periodoId={periodo.id} rolGenerado={periodo.rolGenerado} rolPagoBlobPathname={periodo.rolPagoBlobPathname} />

        <HorarioAjustesPeriodoClient periodo={periodo} />

        <HorarioPeriodoRegistrosClient registros={registrosVista} returnTo={returnTo} />

        {/* Pagos registrados */}
        <section className="overflow-hidden rounded-[1rem] border border-[#3A3A36] bg-[#252622]">
          <div className="border-b border-[#3A3A36] bg-[#30312D] px-4 py-3">
            <h2 className="text-base font-semibold text-[#F5F5F5]">Pagos registrados</h2>
            <p className="mt-0.5 text-xs text-[#A7A7A7]">Historial de pagos activos y anulados para este periodo.</p>
          </div>
          {periodo.pagos.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-[760px] w-full divide-y divide-[#3A3A36] text-left text-sm">
                <thead className="bg-[#30312D] text-[11px] uppercase tracking-wide text-[#8F908A]">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">Fecha</th>
                    <th className="px-3 py-2.5 font-semibold">Monto</th>
                    <th className="px-3 py-2.5 font-semibold">Método</th>
                    <th className="px-3 py-2.5 font-semibold">Transacción</th>
                    <th className="px-3 py-2.5 font-semibold">Estado</th>
                    <th className="px-3 py-2.5 font-semibold">Comprobante</th>
                    <th className="px-3 py-2.5 font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#3A3A36] text-[#CFCFCB]">
                  {periodo.pagos.map((pago) => (
                    <tr key={pago.id} className="transition hover:bg-[#2D2E2A]">
                      <td className="px-3 py-2.5">{pago.fechaPago}</td>
                      <td className="px-3 py-2.5 font-semibold text-[#D7FF4F] tabular-nums">{formatMoney(pago.montoPagado)}</td>
                      <td className="px-3 py-2.5">{pago.metodoPago || "--"}</td>
                      <td className="px-3 py-2.5">
                        <p>{pago.numeroTransaccion || "--"}</p>
                        {pago.bancoCuentaOrigen ? <p className="text-xs text-[#8F908A]">{pago.bancoCuentaOrigen}</p> : null}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${pagoStatusClasses(pago.estadoPago)}`}>
                          {pago.estadoPago}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {pago.comprobantes.length ? (
                          <a href={pago.comprobantes[0].url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-[#CFCFCB] transition hover:text-[#D7FF4F]">
                            Ver comprobante
                          </a>
                        ) : (
                          <span className="text-[#8F908A]">--</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {pago.estadoPago === "Registrado" ? (
                          <AnularPagoHorarioButton periodoId={periodo.id} pagoId={pago.id} />
                        ) : (
                          <span className="text-[#8F908A]">--</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-medium text-[#CFCFCB]">Aún no hay pagos registrados para este periodo.</p>
              <p className="mt-1 text-xs text-[#8F908A]">Usa el botón de pago para registrar el primer pago de este periodo.</p>
            </div>
          )}
        </section>
      </section>
    </StaffAppShell>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { HorariosAdminJornadasClient } from "@/components/horarios/HorariosAdminJornadasClient";
import { HorariosAdminPeriodosClient } from "@/components/horarios/HorariosAdminPeriodosClient";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { isAdministratorRole } from "@/lib/apps";
import { fetchHorariosAdminResumen, fetchHorariosEmpleadosParaPeriodo, fetchJornadasIncompletasAdmin, fetchPeriodosPago } from "@/lib/horarios/airtable";
import { getSessionFromCookie } from "@/lib/session";
import type { HorarioAdminResumen, HorarioEmpleadoPeriodoOption, HorarioPeriodoPagoDetalle, HorarioRegistro } from "@/types/horarios";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{
    inicio?: string | string[];
    fin?: string | string[];
  }>;
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

function formatDateRange(resumen: HorarioAdminResumen | null) {
  if (!resumen) {
    return "Semana actual";
  }
  return `${resumen.periodo.fechaInicio} — ${resumen.periodo.fechaFin}`;
}

function getSearchParamValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeDateParam(value?: string | string[]) {
  const date = getSearchParamValue(value)?.trim();
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
}

function AdminMetricCard({
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
        className={`mt-0.5 text-xl font-semibold ${
          accent ? "text-[#D7FF4F]" : warn ? "text-amber-200" : "text-[#F5F5F5]"
        }`}
      >
        {value}
      </p>
      {helper ? <p className="mt-1 text-[10px] leading-tight text-[#8F908A]">{helper}</p> : null}
    </div>
  );
}

export default async function HorariosAdminPage({ searchParams }: PageProps) {
  const session = await getSessionFromCookie();

  if (!session) {
    redirect("/login");
  }

  if (!isAdministratorRole(session.user.rol)) {
    redirect("/acceso-denegado");
  }

  let error = "";
  let resumen: HorarioAdminResumen | null = null;
  let periodos: HorarioPeriodoPagoDetalle[] = [];
  let empleados: HorarioEmpleadoPeriodoOption[] = [];
  let jornadasIncompletas: HorarioRegistro[] = [];
  const params = await searchParams;
  const fechaInicio = normalizeDateParam(params?.inicio);
  const fechaFin = normalizeDateParam(params?.fin);

  const [resumenResult, periodosResult, empleadosResult, jornadasResult] = await Promise.allSettled([
    fetchHorariosAdminResumen({ fechaInicio, fechaFin }),
    fetchPeriodosPago(),
    fetchHorariosEmpleadosParaPeriodo(),
    fetchJornadasIncompletasAdmin()
  ]);

  if (resumenResult.status === "fulfilled") {
    resumen = resumenResult.value;
  } else {
    console.error("Error al cargar resumen admin de horarios:", resumenResult.reason);
    error = "No se pudo cargar el resumen administrativo de horarios.";
  }

  if (periodosResult.status === "fulfilled") {
    periodos = periodosResult.value;
  } else {
    console.warn("No se pudieron cargar periodos de pago en la vista admin:", periodosResult.reason);
  }

  if (empleadosResult.status === "fulfilled") {
    empleados = empleadosResult.value;
  } else {
    console.warn("No se pudieron cargar empleados para periodos de pago:", empleadosResult.reason);
  }

  if (jornadasResult.status === "fulfilled") {
    jornadasIncompletas = jornadasResult.value;
  } else {
    console.warn("No se pudieron cargar jornadas incompletas:", jornadasResult.reason);
  }

  const totales = resumen?.totales;
  const empleadosConSaldo =
    resumen?.empleados.filter((e) => (e.saldoPendienteReal ?? e.saldoPendiente) > 0).length ?? 0;

  return (
    <StaffAppShell activeHref="/horarios" sectionLabel="Horarios">
      <section className="w-full space-y-3 text-left">

        {/* Filtro de fechas */}
        <div className="rounded-[1rem] border border-[#3A3A36] bg-[#252622] px-4 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#8F908A]">Rango activo</p>
              <p className="mt-0.5 text-lg font-semibold text-[#F5F5F5]">{formatDateRange(resumen)}</p>
              <p className="mt-0.5 text-xs text-[#A7A7A7]">Solo jornadas finalizadas o revisadas en este rango.</p>
            </div>
            <form action="/horarios/admin" className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <label className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wide text-[#8F908A]">Fecha inicio</span>
                <input
                  type="date"
                  name="inicio"
                  defaultValue={resumen?.periodo.fechaInicio || fechaInicio || ""}
                  className="h-9 w-full rounded-xl border border-[#3A3A36] bg-[#1E1F1C] px-3 text-sm text-[#F5F5F5] outline-none transition focus:border-[#D7FF4F]/60"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wide text-[#8F908A]">Fecha fin</span>
                <input
                  type="date"
                  name="fin"
                  defaultValue={resumen?.periodo.fechaFin || fechaFin || ""}
                  className="h-9 w-full rounded-xl border border-[#3A3A36] bg-[#1E1F1C] px-3 text-sm text-[#F5F5F5] outline-none transition focus:border-[#D7FF4F]/60"
                />
              </label>
              <button
                type="submit"
                className="h-9 rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-4 text-sm font-semibold text-[#10110E] transition hover:brightness-105"
              >
                Aplicar
              </button>
            </form>
          </div>
        </div>

        {error ? (
          <p className="rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2.5 text-sm text-red-100">
            {error}
          </p>
        ) : null}

        {/* Métricas */}
        <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-4">
          <AdminMetricCard
            label="Generado en rango"
            value={formatMoney(totales?.generadoEnRango ?? totales?.totalNeto ?? 0)}
            helper="Jornadas finalizadas o revisadas"
          />
          <AdminMetricCard
            label="Pagado en rango"
            value={formatMoney(totales?.pagadoEnRango ?? totales?.totalPagado ?? 0)}
            helper="Pagos activos registrados en el rango"
          />
          <AdminMetricCard
            label="Saldo pendiente real"
            value={formatMoney(totales?.saldoPendienteReal ?? totales?.saldoPendiente ?? 0)}
            helper="Saldos de periodos abiertos o parciales"
            accent={(totales?.saldoPendienteReal ?? totales?.saldoPendiente ?? 0) > 0}
          />
          <AdminMetricCard
            label="Pendiente sin periodo"
            value={formatMoney(totales?.pendienteNuevoSinPeriodo ?? 0)}
            helper="Jornadas del rango aún no agrupadas en un periodo"
            warn={(totales?.pendienteNuevoSinPeriodo ?? 0) > 0}
          />
        </div>

        {/* Alertas rápidas */}
        {jornadasIncompletas.length > 0 || empleadosConSaldo > 0 ? (
          <div className="flex flex-wrap gap-2">
            {jornadasIncompletas.length > 0 ? (
              <span className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-200">
                {jornadasIncompletas.length} jornada{jornadasIncompletas.length !== 1 ? "s" : ""} incompleta{jornadasIncompletas.length !== 1 ? "s" : ""}
              </span>
            ) : null}
            {empleadosConSaldo > 0 ? (
              <span className="inline-flex items-center rounded-full border border-[#D7FF4F]/30 bg-[#D7FF4F]/10 px-3 py-1 text-xs font-semibold text-[#D7FF4F]">
                {empleadosConSaldo} empleado{empleadosConSaldo !== 1 ? "s" : ""} con saldo pendiente
              </span>
            ) : null}
          </div>
        ) : resumen ? (
          <p className="text-xs text-[#8F908A]">Sin alertas para el rango seleccionado.</p>
        ) : null}

        {/* Resumen por empleado */}
        <div className="overflow-hidden rounded-[1rem] border border-[#3A3A36] bg-[#252622]">
          <div className="border-b border-[#3A3A36] bg-[#30312D] px-4 py-3">
            <h2 className="text-base font-semibold text-[#F5F5F5]">Resumen por empleado</h2>
            <p className="mt-0.5 text-xs text-[#A7A7A7]">Solo incluye jornadas con estado Finalizado o Revisado.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full divide-y divide-[#3A3A36] text-left text-sm">
              <thead className="bg-[#30312D] text-[11px] uppercase tracking-wide text-[#8F908A]">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Empleado</th>
                  <th className="px-3 py-2.5 font-semibold">Días finalizados</th>
                  <th className="px-3 py-2.5 font-semibold">Horas trabajadas</th>
                  <th className="px-3 py-2.5 font-semibold">Generado en rango</th>
                  <th className="px-3 py-2.5 font-semibold">Ajustes</th>
                  <th className="px-3 py-2.5 font-semibold">Pagado asociado</th>
                  <th className="px-3 py-2.5 font-semibold">Saldo pendiente</th>
                  <th className="px-3 py-2.5 font-semibold">Sin periodo</th>
                  <th className="px-3 py-2.5 font-semibold">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#3A3A36] text-[#CFCFCB]">
                {resumen?.empleados.length ? (
                  resumen.empleados.map((empleado) => {
                    const saldo = empleado.saldoPendienteReal ?? empleado.saldoPendiente;
                    const sinPeriodoCount = empleado.jornadasSinPeriodoCount ?? 0;
                    const needsAction = saldo > 0 || sinPeriodoCount > 0;
                    return (
                      <tr
                        key={empleado.empleadoKey}
                        className={`transition ${needsAction ? "hover:bg-[#D7FF4F]/[0.04]" : "hover:bg-[#2D2E2A]"}`}
                      >
                        <td className="px-3 py-2.5">
                          <p className="font-semibold text-[#F5F5F5]">{empleado.empleado}</p>
                          <p className="text-xs text-[#8F908A]">{empleado.correo || empleado.usuarioId}</p>
                        </td>
                        <td className="px-3 py-2.5 tabular-nums">{empleado.registrosCount}</td>
                        <td className="px-3 py-2.5 font-semibold text-[#F5F5F5] tabular-nums">{formatHours(empleado.horasTrabajadas)}</td>
                        <td className="px-3 py-2.5 font-semibold text-[#F5F5F5] tabular-nums">{formatMoney(empleado.generadoEnRango ?? empleado.totalGanado)}</td>
                        <td className={`px-3 py-2.5 font-semibold tabular-nums ${empleado.totalAjustes < 0 ? "text-red-300" : "text-[#CFCFCB]"}`}>
                          {formatMoney(empleado.totalAjustes)}
                        </td>
                        <td className="px-3 py-2.5 font-semibold tabular-nums">{formatMoney(empleado.pagadoAsociado ?? empleado.totalPagado)}</td>
                        <td className="px-3 py-2.5 tabular-nums">
                          <span className={`font-semibold ${saldo > 0 ? "text-[#D7FF4F]" : "text-[#CFCFCB]"}`}>
                            {formatMoney(saldo)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 tabular-nums">
                          <p className={`font-semibold ${sinPeriodoCount > 0 ? "text-amber-200" : "text-[#CFCFCB]"}`}>
                            {formatMoney(empleado.pendienteNuevoSinPeriodo ?? 0)}
                          </p>
                          <p className="text-xs text-[#8F908A]">{sinPeriodoCount} jornadas</p>
                        </td>
                        <td className="px-3 py-2.5">
                          {empleado.empleadoRecordId ? (
                            <Link
                              href={`/horarios/admin/empleados/${empleado.empleadoRecordId}`}
                              className="inline-flex rounded-full border border-[#D7FF4F]/30 px-3 py-1.5 text-xs font-semibold text-[#D7FF4F] transition hover:bg-[#D7FF4F] hover:text-[#10110E]"
                            >
                              Gestionar
                            </Link>
                          ) : (
                            <span className="text-xs text-[#8F908A]">Sin empleado vinculado</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-[#8F908A]">
                      No hay jornadas finalizadas o revisadas para el rango seleccionado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <HorariosAdminJornadasClient jornadas={jornadasIncompletas} />

        <HorariosAdminPeriodosClient periodos={periodos} empleados={empleados} />
      </section>
    </StaffAppShell>
  );
}

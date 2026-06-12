import Link from "next/link";
import { redirect } from "next/navigation";
import { HorariosAdminJornadasClient } from "@/components/horarios/HorariosAdminJornadasClient";
import { HorariosAdminPeriodosClient } from "@/components/horarios/HorariosAdminPeriodosClient";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { StaffStatCard } from "@/components/staff/StaffDesignSystem";
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

  return `${resumen.periodo.fechaInicio} - ${resumen.periodo.fechaFin}`;
}

function getSearchParamValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeDateParam(value?: string | string[]) {
  const date = getSearchParamValue(value)?.trim();

  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
}

function metricCards(resumen: HorarioAdminResumen | null) {
  const totales = resumen?.totales;

  return [
    {
      label: "Generado en el rango",
      value: formatMoney(totales?.generadoEnRango ?? totales?.totalNeto ?? 0),
      helper: "Jornadas finalizadas o revisadas"
    },
    {
      label: "Pagado en el rango",
      value: formatMoney(totales?.pagadoEnRango ?? totales?.totalPagado ?? 0),
      helper: "Pagos activos registrados en el rango"
    },
    {
      label: "Saldo pendiente real",
      value: formatMoney(totales?.saldoPendienteReal ?? totales?.saldoPendiente ?? 0),
      helper: "Saldos de periodos abiertos o parciales"
    },
    {
      label: "Pendiente nuevo sin periodo",
      value: formatMoney(totales?.pendienteNuevoSinPeriodo ?? 0),
      helper: "Jornadas del rango aún no agrupadas"
    }
  ];
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

  return (
    <StaffAppShell activeHref="/horarios" sectionLabel="Horarios">
      <section className="w-full space-y-2.5 text-left">
        <div className="rounded-xl border border-[#30312D] bg-[#151613] px-3 py-2 shadow-xl shadow-black/20">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Rango de consulta</h2>
              <p className="mt-0.5 text-sm text-zinc-400">Rango seleccionado</p>
              <p className="mt-0.5 text-lg font-semibold text-white">{formatDateRange(resumen)}</p>
            </div>
            <form action="/horarios/admin" className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <label className="space-y-1">
                <span className="text-[12px] font-bold uppercase tracking-normal text-[#8F908A]">Fecha inicio</span>
                <input
                  type="date"
                  name="inicio"
                  defaultValue={resumen?.periodo.fechaInicio || fechaInicio || ""}
                  className="h-9 w-full rounded-lg border border-[#3A3A36] bg-[#121310] px-3 text-sm text-white outline-none transition focus:border-geek-lime/60"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[12px] font-bold uppercase tracking-normal text-[#8F908A]">Fecha fin</span>
                <input
                  type="date"
                  name="fin"
                  defaultValue={resumen?.periodo.fechaFin || fechaFin || ""}
                  className="h-9 w-full rounded-lg border border-[#3A3A36] bg-[#121310] px-3 text-sm text-white outline-none transition focus:border-geek-lime/60"
                />
              </label>
              <button
                type="submit"
                className="h-9 rounded-lg bg-geek-lime px-3 text-sm font-semibold text-geek-black transition hover:bg-white"
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

        <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-4">
          {metricCards(resumen).map((card) => (
            <StaffStatCard key={card.label} label={card.label} value={card.value} tone="lime" density="compact" />
          ))}
        </div>

        <div className="overflow-hidden rounded-xl border border-[#30312D] bg-[#171814] shadow-2xl shadow-black/20">
          <div className="border-b border-[#30312D] bg-[#20211D] px-3 py-2">
            <h2 className="text-base font-semibold text-white">Resumen por empleado</h2>
            <p className="mt-0.5 text-sm text-zinc-400">Solo incluye jornadas con estado Finalizado o Revisado.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1120px] w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-[#20211D] text-[12px] uppercase text-zinc-400">
                <tr>
                  <th className="px-3 py-2 font-semibold">Empleado</th>
                  <th className="px-3 py-2 font-semibold">Días finalizados</th>
                  <th className="px-3 py-2 font-semibold">Horas trabajadas</th>
                  <th className="px-3 py-2 font-semibold">Generado en rango</th>
                  <th className="px-3 py-2 font-semibold">Ajustes rango</th>
                  <th className="px-3 py-2 font-semibold">Pagado asociado</th>
                  <th className="px-3 py-2 font-semibold">Saldo pendiente real</th>
                  <th className="px-3 py-2 font-semibold">Sin periodo</th>
                  <th className="px-3 py-2 font-semibold">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {resumen?.empleados.length ? (
                  resumen.empleados.map((empleado) => (
                    <tr key={empleado.empleadoKey} className="text-zinc-200">
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-white">{empleado.empleado}</p>
                        <p className="text-xs text-zinc-500">{empleado.correo || empleado.usuarioId}</p>
                      </td>
                      <td className="px-3 py-2.5">{empleado.registrosCount}</td>
                      <td className="px-3 py-2.5 font-semibold text-white">{formatHours(empleado.horasTrabajadas)}</td>
                      <td className="px-3 py-2.5 font-semibold text-white">{formatMoney(empleado.generadoEnRango ?? empleado.totalGanado)}</td>
                      <td className={`px-3 py-2.5 font-semibold ${empleado.totalAjustes < 0 ? "text-red-100" : "text-zinc-300"}`}>
                        {formatMoney(empleado.totalAjustes)}
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-zinc-100">{formatMoney(empleado.pagadoAsociado ?? empleado.totalPagado)}</td>
                      <td className="px-3 py-2.5 font-semibold text-geek-lime">{formatMoney(empleado.saldoPendienteReal ?? empleado.saldoPendiente)}</td>
                      <td className="px-3 py-2.5">
                        <p className="font-semibold text-white">{formatMoney(empleado.pendienteNuevoSinPeriodo ?? 0)}</p>
                        <p className="text-xs text-zinc-500">{empleado.jornadasSinPeriodoCount ?? 0} jornadas</p>
                      </td>
                      <td className="px-3 py-2.5">
                        {empleado.empleadoRecordId ? (
                          <Link
                            href={`/horarios/admin/empleados/${empleado.empleadoRecordId}`}
                            className="inline-flex rounded-lg border border-geek-lime/30 px-3 py-1.5 text-xs font-semibold text-geek-lime transition hover:border-white/40 hover:text-white"
                          >
                            Gestionar pagos
                          </Link>
                        ) : (
                          <span className="text-xs text-zinc-500">Sin empleado vinculado</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9} className="px-3 py-5 text-center text-zinc-400">
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

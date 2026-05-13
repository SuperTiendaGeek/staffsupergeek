import Link from "next/link";
import { redirect } from "next/navigation";
import { HorariosAdminJornadasClient } from "@/components/horarios/HorariosAdminJornadasClient";
import { HorariosAdminPeriodosClient } from "@/components/horarios/HorariosAdminPeriodosClient";
import { PortalShell } from "@/components/PortalShell";
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
      label: "Horas finalizadas del rango",
      value: formatHours(totales?.horasTrabajadas || 0),
      helper: `${totales?.minutosTrabajados || 0} min`
    },
    {
      label: "A pagar en el rango",
      value: formatMoney(totales?.totalNeto || 0),
      helper: "Neto después de descuentos"
    },
    {
      label: "Pagado en el rango",
      value: formatMoney(totales?.totalPagado || 0),
      helper: "Pagos activos con fecha dentro del rango"
    },
    {
      label: "Pendiente del rango",
      value: formatMoney(totales?.saldoPendiente || 0),
      helper: "A pagar menos pagado"
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

  try {
    [resumen, periodos, empleados, jornadasIncompletas] = await Promise.all([
      fetchHorariosAdminResumen({ fechaInicio, fechaFin }),
      fetchPeriodosPago(),
      fetchHorariosEmpleadosParaPeriodo(),
      fetchJornadasIncompletasAdmin()
    ]);
  } catch (loadError) {
    console.error("Error al cargar vista admin de horarios:", loadError);
    error = "No se pudo cargar la vista administrativa de horarios.";
  }

  return (
    <PortalShell
      eyebrow="Administración"
      title="Horarios y pagos"
      description="Consulta horas finalizadas, pagos y saldos pendientes por empleado según el rango seleccionado."
    >
      <section className="w-full max-w-6xl space-y-5 text-left">
        <div className="rounded-lg border border-white/10 bg-white/[0.045] p-4 shadow-2xl shadow-black/20 backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Rango de consulta</h2>
              <p className="mt-1 text-sm text-zinc-400">Rango seleccionado</p>
              <p className="mt-1 text-xl font-semibold text-white">{formatDateRange(resumen)}</p>
            </div>
            <form action="/horarios/admin" className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-normal text-zinc-500">Fecha inicio</span>
                <input
                  type="date"
                  name="inicio"
                  defaultValue={resumen?.periodo.fechaInicio || fechaInicio || ""}
                  className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white outline-none transition focus:border-geek-lime/60"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-normal text-zinc-500">Fecha fin</span>
                <input
                  type="date"
                  name="fin"
                  defaultValue={resumen?.periodo.fechaFin || fechaFin || ""}
                  className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white outline-none transition focus:border-geek-lime/60"
                />
              </label>
              <button
                type="submit"
                className="rounded-md bg-geek-lime px-4 py-2.5 text-sm font-semibold text-geek-black transition hover:bg-white"
              >
                Aplicar
              </button>
            </form>
          </div>
        </div>

        {error ? (
          <p className="rounded-md border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100">
            {error}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metricCards(resumen).map((card) => (
            <div key={card.label} className="rounded-lg border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/20 backdrop-blur">
              <p className="text-sm text-zinc-400">{card.label}</p>
              <p className="mt-2 text-2xl font-semibold text-white">{card.value}</p>
              <p className="mt-2 text-xs text-zinc-500">{card.helper}</p>
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.035] shadow-2xl shadow-black/20 backdrop-blur">
          <div className="border-b border-white/10 px-4 py-4">
            <h2 className="text-lg font-semibold text-white">Resumen por empleado</h2>
            <p className="mt-1 text-sm text-zinc-400">Solo incluye jornadas con estado Finalizado o Revisado.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1120px] w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-white/[0.04] text-xs uppercase text-zinc-400">
                <tr>
                  <th className="px-4 py-3 font-semibold">Empleado</th>
                  <th className="px-4 py-3 font-semibold">Días finalizados</th>
                  <th className="px-4 py-3 font-semibold">Horas trabajadas</th>
                  <th className="px-4 py-3 font-semibold">Bruto</th>
                  <th className="px-4 py-3 font-semibold">Descuentos</th>
                  <th className="px-4 py-3 font-semibold">Neto a pagar</th>
                  <th className="px-4 py-3 font-semibold">Total pagado</th>
                  <th className="px-4 py-3 font-semibold">Saldo pendiente</th>
                  <th className="px-4 py-3 font-semibold">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {resumen?.empleados.length ? (
                  resumen.empleados.map((empleado) => (
                    <tr key={empleado.empleadoKey} className="text-zinc-200">
                      <td className="px-4 py-4">
                        <p className="font-medium text-white">{empleado.empleado}</p>
                        <p className="text-xs text-zinc-500">{empleado.correo || empleado.usuarioId}</p>
                      </td>
                      <td className="px-4 py-4">{empleado.registrosCount}</td>
                      <td className="px-4 py-4 font-semibold text-white">{formatHours(empleado.horasTrabajadas)}</td>
                      <td className="px-4 py-4 font-semibold text-white">{formatMoney(empleado.totalGanado)}</td>
                      <td className={`px-4 py-4 font-semibold ${empleado.totalAjustes < 0 ? "text-red-100" : "text-zinc-300"}`}>
                        {formatMoney(empleado.totalAjustes)}
                      </td>
                      <td className="px-4 py-4 font-semibold text-white">{formatMoney(empleado.totalNeto)}</td>
                      <td className="px-4 py-4 font-semibold text-zinc-100">{formatMoney(empleado.totalPagado)}</td>
                      <td className="px-4 py-4 font-semibold text-geek-lime">{formatMoney(empleado.saldoPendiente)}</td>
                      <td className="px-4 py-4">
                        {empleado.empleadoRecordId ? (
                          <Link
                            href={`/horarios/admin/empleados/${empleado.empleadoRecordId}`}
                            className="inline-flex rounded-md border border-geek-lime/30 px-3 py-2 text-xs font-semibold text-geek-lime transition hover:border-white/40 hover:text-white"
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
                    <td colSpan={9} className="px-4 py-8 text-center text-zinc-400">
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
    </PortalShell>
  );
}

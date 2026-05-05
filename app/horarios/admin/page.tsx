import { redirect } from "next/navigation";
import { HorariosAdminJornadasClient } from "@/components/horarios/HorariosAdminJornadasClient";
import { HorariosAdminPeriodosClient } from "@/components/horarios/HorariosAdminPeriodosClient";
import { PortalShell } from "@/components/PortalShell";
import { isAdministratorRole } from "@/lib/apps";
import { fetchHorariosAdminResumen, fetchHorariosEmpleadosParaPeriodo, fetchJornadasIncompletasAdmin, fetchPeriodosPago } from "@/lib/horarios/airtable";
import { getSessionFromCookie } from "@/lib/session";
import type { HorarioAdminResumen, HorarioEmpleadoPeriodoOption, HorarioPeriodoPagoDetalle, HorarioRegistro } from "@/types/horarios";

export const dynamic = "force-dynamic";

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

function metricCards(resumen: HorarioAdminResumen | null) {
  const totales = resumen?.totales;

  return [
    {
      label: "Horas semana",
      value: formatHours(totales?.horasTrabajadas || 0),
      helper: `${totales?.minutosTrabajados || 0} min`
    },
    {
      label: "Ganado semana",
      value: formatMoney(totales?.totalGanado || 0),
      helper: "Registros finalizados/revisados"
    },
    {
      label: "Total pagado",
      value: formatMoney(totales?.totalPagado || 0),
      helper: "Pagos activos registrados"
    },
    {
      label: "Saldo pendiente",
      value: formatMoney(totales?.saldoPendiente || 0),
      helper: "Ganado menos pagado"
    }
  ];
}

export default async function HorariosAdminPage() {
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

  try {
    [resumen, periodos, empleados, jornadasIncompletas] = await Promise.all([
      fetchHorariosAdminResumen(),
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
      description="Resumen semanal de horas trabajadas, pagos registrados y saldos pendientes por empleado."
    >
      <section className="w-full max-w-6xl space-y-5 text-left">
        <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.045] p-4 shadow-2xl shadow-black/20 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-zinc-400">Periodo</p>
            <p className="mt-1 text-xl font-semibold text-white">{formatDateRange(resumen)}</p>
          </div>
          <div className="rounded-md border border-geek-lime/20 bg-geek-lime/10 px-3 py-2 text-sm font-medium text-geek-lime">
            Semana actual
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
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-white/[0.04] text-xs uppercase text-zinc-400">
                <tr>
                  <th className="px-4 py-3 font-semibold">Empleado</th>
                  <th className="px-4 py-3 font-semibold">Registros</th>
                  <th className="px-4 py-3 font-semibold">Horas trabajadas</th>
                  <th className="px-4 py-3 font-semibold">Total ganado</th>
                  <th className="px-4 py-3 font-semibold">Total pagado</th>
                  <th className="px-4 py-3 font-semibold">Saldo pendiente</th>
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
                      <td className="px-4 py-4 font-semibold text-zinc-100">{formatMoney(empleado.totalPagado)}</td>
                      <td className="px-4 py-4 font-semibold text-geek-lime">{formatMoney(empleado.saldoPendiente)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                      No hay registros finalizados o revisados para la semana actual.
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

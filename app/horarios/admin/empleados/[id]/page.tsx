import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CerrarPeriodoHastaFechaButton } from "@/components/horarios/CerrarPeriodoHastaFechaButton";
import { PortalShell } from "@/components/PortalShell";
import { isAdministratorRole } from "@/lib/apps";
import { fetchHorarioEmpleadoAdminDetalle } from "@/lib/horarios/airtable";
import { getSessionFromCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

const HORARIOS_TIME_ZONE = "America/Guayaquil";

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD"
  }).format(value);
}

function formatHours(value: number) {
  return `${value.toFixed(2)} h`;
}

function formatTime(value?: string) {
  if (!value) {
    return "--:--";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: HORARIOS_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function statusClasses(status: string) {
  if (status === "Pagado" || status === "Finalizado" || status === "Revisado") {
    return "border-geek-lime/30 bg-geek-lime/10 text-geek-lime";
  }

  if (status === "Parcialmente pagado") {
    return "border-amber-300/30 bg-amber-300/10 text-amber-100";
  }

  return "border-[#30312D] bg-white/[0.05] text-zinc-300";
}

export default async function HorarioEmpleadoAdminPage({ params }: PageProps) {
  const session = await getSessionFromCookie();

  if (!session) {
    redirect("/login");
  }

  if (!isAdministratorRole(session.user.rol)) {
    redirect("/acceso-denegado");
  }

  const { id } = await params;
  const detalle = await fetchHorarioEmpleadoAdminDetalle(id);

  if (!detalle) {
    notFound();
  }

  const metrics = [
    { label: "Total ganado pendiente", value: formatMoney(detalle.resumen.totalGanadoPendiente), helper: "Periodos abiertos y jornadas sin periodo" },
    { label: "Total pagado", value: formatMoney(detalle.resumen.totalPagado), helper: `${detalle.resumen.pagosCount} pagos activos` },
    { label: "Saldo pendiente", value: formatMoney(detalle.resumen.saldoPendiente), helper: "Saldo por gestionar" },
    { label: "Jornadas pendientes", value: String(detalle.resumen.jornadasPendientesCount), helper: "Finalizadas o revisadas sin periodo" }
  ];

  return (
    <PortalShell
      density="compact"
      eyebrow="Administración"
      title="Empleado y pagos"
      description="Saldo, jornadas pendientes, periodos y pagos registrados del empleado."
    >
      <section className="w-full space-y-3 text-left">
        <Link href="/horarios/admin" className="text-sm font-semibold text-geek-lime transition hover:text-white">
          Volver a horarios y pagos
        </Link>

        <section className="rounded-lg border border-[#30312D] bg-[#151613] px-3 py-2.5 shadow-2xl shadow-black/20 backdrop-blur">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm text-zinc-400">Empleado</p>
              <h2 className="mt-1 text-xl font-semibold text-white">{detalle.empleado.empleado}</h2>
              <p className="mt-1 text-sm text-zinc-500">{detalle.empleado.correo || detalle.empleado.usuarioId}</p>
              <p className="mt-2 text-sm text-zinc-300">
                {[detalle.empleado.rol, detalle.empleado.cedula].filter(Boolean).join(" · ") || "Datos administrativos no registrados"}
              </p>
            </div>
            {detalle.periodos[0] ? (
              <Link
                href={`/horarios/admin/periodos/${detalle.periodos[0].id}`}
                className="rounded-md bg-geek-lime px-4 py-2.5 text-sm font-semibold text-geek-black transition hover:bg-white"
              >
                Registrar pago
              </Link>
            ) : (
              <span className="rounded-md border border-[#30312D] px-4 py-2.5 text-sm font-medium text-zinc-400">
                Sin periodo para pago
              </span>
            )}
          </div>
        </section>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-lg border border-[#30312D] bg-[#151613] px-3 py-2.5 shadow-2xl shadow-black/20 backdrop-blur">
              <p className="text-sm text-zinc-400">{metric.label}</p>
              <p className="mt-2 text-xl font-semibold text-white">{metric.value}</p>
              <p className="mt-2 text-xs text-zinc-500">{metric.helper}</p>
            </div>
          ))}
        </div>

        <section className="overflow-hidden rounded-lg border border-[#30312D] bg-[#171814] shadow-2xl shadow-black/20 backdrop-blur">
          <div className="border-b border-[#30312D] px-3 py-2.5">
            <h2 className="text-lg font-semibold text-white">Jornadas pendientes de pago</h2>
            <p className="mt-1 text-sm text-zinc-400">Finalizadas o revisadas que todavía no están dentro de un periodo activo.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-white/[0.04] text-xs uppercase text-zinc-400">
                <tr>
                  <th className="px-3 py-2 font-semibold">Fecha</th>
                  <th className="px-3 py-2 font-semibold">Entrada</th>
                  <th className="px-3 py-2 font-semibold">Salida final</th>
                  <th className="px-3 py-2 font-semibold">Horas</th>
                  <th className="px-3 py-2 font-semibold">Total día</th>
                  <th className="px-3 py-2 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {detalle.jornadasPendientes.length ? (
                  detalle.jornadasPendientes.map((registro) => (
                    <tr key={registro.id} className="text-zinc-200">
                      <td className="px-3 py-2.5">{registro.fecha}</td>
                      <td className="px-3 py-2.5">{formatTime(registro.entrada)}</td>
                      <td className="px-3 py-2.5">{formatTime(registro.salidaFinal)}</td>
                      <td className="px-3 py-2.5 font-semibold text-white">{formatHours(registro.horasTrabajadas)}</td>
                      <td className="px-3 py-2.5 font-semibold text-geek-lime">{formatMoney(registro.totalEstimadoDia)}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold ${statusClasses(registro.estadoDia)}`}>
                          {registro.estadoDia}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-3 py-5 text-center text-zinc-400">
                      No hay jornadas pendientes fuera de periodos.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-[#30312D] bg-[#171814] shadow-2xl shadow-black/20 backdrop-blur">
          <div className="border-b border-[#30312D] px-3 py-2.5">
            <h2 className="text-lg font-semibold text-white">Periodos existentes</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-white/[0.04] text-xs uppercase text-zinc-400">
                <tr>
                  <th className="px-3 py-2 font-semibold">Periodo</th>
                  <th className="px-3 py-2 font-semibold">Estado</th>
                  <th className="px-3 py-2 font-semibold">Horas</th>
                  <th className="px-3 py-2 font-semibold">Total neto</th>
                  <th className="px-3 py-2 font-semibold">Pagado</th>
                  <th className="px-3 py-2 font-semibold">Saldo neto</th>
                  <th className="px-3 py-2 font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {detalle.periodos.length ? (
                  detalle.periodos.map((periodo) => (
                    <tr key={periodo.id} className="text-zinc-200">
                      <td className="px-3 py-2.5">{periodo.fechaInicio} - {periodo.fechaFin}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold ${statusClasses(periodo.estadoPeriodo)}`}>
                          {periodo.estadoPeriodo}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-white">{formatHours(periodo.totalHoras)}</td>
                      <td className="px-3 py-2.5">{formatMoney(periodo.totalNeto)}</td>
                      <td className="px-3 py-2.5">{formatMoney(periodo.totalPagado)}</td>
                      <td className="px-3 py-2.5 font-semibold text-geek-lime">{formatMoney(periodo.saldoPendienteNeto)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/horarios/admin/periodos/${periodo.id}`}
                            className="inline-flex rounded-md border border-geek-lime/30 px-2.5 py-1.5 text-xs font-semibold text-geek-lime transition hover:border-white/40 hover:text-white"
                          >
                            Registrar pago
                          </Link>
                          <CerrarPeriodoHastaFechaButton periodoId={periodo.id} fechaInicio={periodo.fechaInicio} fechaFin={periodo.fechaFin} />
                          {periodo.totalPagado > 0 ? (
                            <Link
                              href={`/horarios/admin/periodos/${periodo.id}`}
                              className="inline-flex rounded-md border border-[#30312D] px-2.5 py-1.5 text-xs font-semibold text-zinc-200 transition hover:border-white/40 hover:text-white"
                            >
                              Generar rol
                            </Link>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-3 py-5 text-center text-zinc-400">
                      No hay periodos registrados para este empleado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-[#30312D] bg-[#171814] shadow-2xl shadow-black/20 backdrop-blur">
          <div className="border-b border-[#30312D] px-3 py-2.5">
            <h2 className="text-lg font-semibold text-white">Pagos realizados</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-white/[0.04] text-xs uppercase text-zinc-400">
                <tr>
                  <th className="px-3 py-2 font-semibold">Fecha</th>
                  <th className="px-3 py-2 font-semibold">Monto</th>
                  <th className="px-3 py-2 font-semibold">Método</th>
                  <th className="px-3 py-2 font-semibold">Transacción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {detalle.pagos.length ? (
                  detalle.pagos.map((pago) => (
                    <tr key={pago.id} className="text-zinc-200">
                      <td className="px-3 py-2.5">{pago.fechaPago}</td>
                      <td className="px-3 py-2.5 font-semibold text-geek-lime">{formatMoney(pago.montoPagado)}</td>
                      <td className="px-3 py-2.5">{pago.metodoPago || "--"}</td>
                      <td className="px-3 py-2.5">{pago.numeroTransaccion || "--"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-3 py-5 text-center text-zinc-400">
                      No hay pagos activos registrados para este empleado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </PortalShell>
  );
}

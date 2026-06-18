import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CerrarPeriodoHastaFechaButton } from "@/components/horarios/CerrarPeriodoHastaFechaButton";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
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
    return "border-[#D7FF4F]/30 bg-[#D7FF4F]/10 text-[#D7FF4F]";
  }

  if (status === "Parcialmente pagado") {
    return "border-amber-300/30 bg-amber-300/10 text-amber-100";
  }

  return "border-[#3A3A36] bg-[#2D2E2A] text-[#CFCFCB]";
}

function EmpleadoMetricCard({
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

  return (
    <StaffAppShell activeHref="/horarios" sectionLabel="Horarios">
      <section className="w-full space-y-3 text-left">
        <Link
          href="/horarios/admin"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#CFCFCB] transition hover:text-[#D7FF4F]"
        >
          ← Volver a horarios y pagos
        </Link>

        {/* Header: empleado + CTA */}
        <section className="rounded-[1rem] border border-[#3A3A36] bg-[#252622] p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#8F908A]">Detalle de empleado</p>
              <h2 className="mt-0.5 text-xl font-semibold text-[#F5F5F5]">{detalle.empleado.empleado}</h2>
              <p className="mt-0.5 text-sm text-[#A7A7A7]">{detalle.empleado.correo || detalle.empleado.usuarioId}</p>
              <p className="mt-1.5 text-sm text-[#CFCFCB]">
                {[detalle.empleado.rol, detalle.empleado.cedula].filter(Boolean).join(" · ") || "Datos administrativos no registrados"}
              </p>
            </div>
            {detalle.periodos[0] ? (
              <Link
                href={`/horarios/admin/periodos/${detalle.periodos[0].id}`}
                className="inline-flex h-fit w-fit rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-4 py-2 text-sm font-semibold text-[#10110E] transition hover:brightness-105"
              >
                Registrar pago
              </Link>
            ) : (
              <span className="inline-flex h-fit w-fit rounded-full border border-[#3A3A36] px-4 py-2 text-sm font-medium text-[#8F908A]">
                Sin periodo para pago
              </span>
            )}
          </div>
        </section>

        {/* Métricas */}
        <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-4">
          <EmpleadoMetricCard
            label="Total ganado pendiente"
            value={formatMoney(detalle.resumen.totalGanadoPendiente)}
            helper="Periodos abiertos y jornadas sin periodo"
          />
          <EmpleadoMetricCard
            label="Total pagado"
            value={formatMoney(detalle.resumen.totalPagado)}
            helper={`${detalle.resumen.pagosCount} pago${detalle.resumen.pagosCount !== 1 ? "s" : ""} activo${detalle.resumen.pagosCount !== 1 ? "s" : ""}`}
          />
          <EmpleadoMetricCard
            label="Saldo pendiente"
            value={formatMoney(detalle.resumen.saldoPendiente)}
            helper="Saldo por gestionar"
            accent={detalle.resumen.saldoPendiente > 0}
          />
          <EmpleadoMetricCard
            label="Jornadas pendientes"
            value={String(detalle.resumen.jornadasPendientesCount)}
            helper="Finalizadas o revisadas sin periodo"
            warn={detalle.resumen.jornadasPendientesCount > 0}
          />
        </div>

        {/* Jornadas pendientes de pago */}
        <section className="overflow-hidden rounded-[1rem] border border-[#3A3A36] bg-[#252622]">
          <div className="border-b border-[#3A3A36] bg-[#30312D] px-4 py-3">
            <h2 className="text-base font-semibold text-[#F5F5F5]">Jornadas pendientes de pago</h2>
            <p className="mt-0.5 text-xs text-[#A7A7A7]">Finalizadas o revisadas que todavía no están dentro de un periodo activo.</p>
          </div>
          {detalle.jornadasPendientes.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-[640px] w-full divide-y divide-[#3A3A36] text-left text-sm">
                <thead className="bg-[#30312D] text-[11px] uppercase tracking-wide text-[#8F908A]">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">Fecha</th>
                    <th className="px-3 py-2.5 font-semibold">Entrada</th>
                    <th className="px-3 py-2.5 font-semibold">Salida final</th>
                    <th className="px-3 py-2.5 font-semibold">Horas</th>
                    <th className="px-3 py-2.5 font-semibold">Total día</th>
                    <th className="px-3 py-2.5 font-semibold">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#3A3A36] text-[#CFCFCB]">
                  {detalle.jornadasPendientes.map((registro) => (
                    <tr key={registro.id} className="transition hover:bg-[#2D2E2A]">
                      <td className="px-3 py-2.5 text-[#F5F5F5]">{registro.fecha}</td>
                      <td className="px-3 py-2.5 tabular-nums">{formatTime(registro.entrada)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{formatTime(registro.salidaFinal)}</td>
                      <td className="px-3 py-2.5 font-semibold text-[#F5F5F5] tabular-nums">{formatHours(registro.horasTrabajadas)}</td>
                      <td className="px-3 py-2.5 font-semibold text-[#D7FF4F] tabular-nums">{formatMoney(registro.totalEstimadoDia)}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses(registro.estadoDia)}`}>
                          {registro.estadoDia}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-medium text-[#CFCFCB]">No hay jornadas pendientes fuera de periodos.</p>
              <p className="mt-1 text-xs text-[#8F908A]">Todas las jornadas están agrupadas en un periodo activo.</p>
            </div>
          )}
        </section>

        {/* Periodos de pago */}
        <section className="overflow-hidden rounded-[1rem] border border-[#3A3A36] bg-[#252622]">
          <div className="border-b border-[#3A3A36] bg-[#30312D] px-4 py-3">
            <h2 className="text-base font-semibold text-[#F5F5F5]">Periodos de pago</h2>
            <p className="mt-0.5 text-xs text-[#A7A7A7]">Historial de periodos de pago de este empleado.</p>
          </div>
          {detalle.periodos.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-[900px] w-full divide-y divide-[#3A3A36] text-left text-sm">
                <thead className="bg-[#30312D] text-[11px] uppercase tracking-wide text-[#8F908A]">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">Periodo</th>
                    <th className="px-3 py-2.5 font-semibold">Estado</th>
                    <th className="px-3 py-2.5 font-semibold">Horas</th>
                    <th className="px-3 py-2.5 font-semibold">Total neto</th>
                    <th className="px-3 py-2.5 font-semibold">Pagado</th>
                    <th className="px-3 py-2.5 font-semibold">Saldo neto</th>
                    <th className="px-3 py-2.5 font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#3A3A36] text-[#CFCFCB]">
                  {detalle.periodos.map((periodo) => (
                    <tr key={periodo.id} className="transition hover:bg-[#2D2E2A]">
                      <td className="px-3 py-2.5 text-[#F5F5F5]">
                        {periodo.fechaInicio}
                        <span className="mx-1 text-[#8F908A]">→</span>
                        {periodo.fechaFin}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses(periodo.estadoPeriodo)}`}>
                          {periodo.estadoPeriodo}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-[#F5F5F5] tabular-nums">{formatHours(periodo.totalHoras)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{formatMoney(periodo.totalNeto)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{formatMoney(periodo.totalPagado)}</td>
                      <td className="px-3 py-2.5 tabular-nums">
                        <span className={`font-semibold ${periodo.saldoPendienteNeto > 0 ? "text-[#D7FF4F]" : "text-[#CFCFCB]"}`}>
                          {formatMoney(periodo.saldoPendienteNeto)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Link
                            href={`/horarios/admin/periodos/${periodo.id}`}
                            className="inline-flex rounded-full border border-[#D7FF4F]/30 px-2.5 py-1 text-xs font-semibold text-[#D7FF4F] transition hover:bg-[#D7FF4F] hover:text-[#10110E]"
                          >
                            Registrar pago
                          </Link>
                          <CerrarPeriodoHastaFechaButton periodoId={periodo.id} fechaInicio={periodo.fechaInicio} fechaFin={periodo.fechaFin} />
                          {periodo.totalPagado > 0 ? (
                            <Link
                              href={`/horarios/admin/periodos/${periodo.id}`}
                              className="inline-flex rounded-full border border-[#3A3A36] px-2.5 py-1 text-xs font-semibold text-[#CFCFCB] transition hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F]"
                            >
                              Generar rol
                            </Link>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-medium text-[#CFCFCB]">No hay periodos registrados para este empleado.</p>
              <p className="mt-1 text-xs text-[#8F908A]">Los periodos de pago aparecerán aquí una vez creados.</p>
            </div>
          )}
        </section>

        {/* Pagos realizados */}
        <section className="overflow-hidden rounded-[1rem] border border-[#3A3A36] bg-[#252622]">
          <div className="border-b border-[#3A3A36] bg-[#30312D] px-4 py-3">
            <h2 className="text-base font-semibold text-[#F5F5F5]">Pagos realizados</h2>
            <p className="mt-0.5 text-xs text-[#A7A7A7]">Pagos activos registrados en todos los periodos.</p>
          </div>
          {detalle.pagos.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-[480px] w-full divide-y divide-[#3A3A36] text-left text-sm">
                <thead className="bg-[#30312D] text-[11px] uppercase tracking-wide text-[#8F908A]">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">Fecha</th>
                    <th className="px-3 py-2.5 font-semibold">Monto</th>
                    <th className="px-3 py-2.5 font-semibold">Método</th>
                    <th className="px-3 py-2.5 font-semibold">Transacción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#3A3A36] text-[#CFCFCB]">
                  {detalle.pagos.map((pago) => (
                    <tr key={pago.id} className="transition hover:bg-[#2D2E2A]">
                      <td className="px-3 py-2.5">{pago.fechaPago}</td>
                      <td className="px-3 py-2.5 font-semibold text-[#D7FF4F] tabular-nums">{formatMoney(pago.montoPagado)}</td>
                      <td className="px-3 py-2.5">{pago.metodoPago || "--"}</td>
                      <td className="px-3 py-2.5">{pago.numeroTransaccion || "--"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-medium text-[#CFCFCB]">No hay pagos activos registrados para este empleado.</p>
              <p className="mt-1 text-xs text-[#8F908A]">Los pagos aparecerán aquí una vez registrados en los periodos.</p>
            </div>
          )}
        </section>
      </section>
    </StaffAppShell>
  );
}

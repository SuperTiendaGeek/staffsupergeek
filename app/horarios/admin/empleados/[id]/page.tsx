import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CerrarPeriodoHastaFechaButton } from "@/components/horarios/CerrarPeriodoHastaFechaButton";
import { HorarioPeriodoRegistrosClient, type HorarioPeriodoRegistroItem } from "@/components/horarios/HorarioPeriodoRegistrosClient";
import { StaffAppShell } from "@/components/staff/StaffAppShell";
import { isAdministratorRole } from "@/lib/apps";
import { fetchHorarioEmpleadoAdminDetalle } from "@/lib/horarios/airtable";
import { getSessionFromCookie } from "@/lib/session";
import type { HorarioAdminEmpleadoDetalle } from "@/types/horarios";

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

function statusClasses(status: string) {
  if (status === "Pagado" || status === "Finalizado" || status === "Revisado") {
    return "border-[#D7FF4F]/30 bg-[#D7FF4F]/10 text-[#D7FF4F]";
  }

  if (status === "Incompleto") {
    return "border-red-400/30 bg-red-400/10 text-red-200";
  }

  if (status === "Parcialmente pagado") {
    return "border-amber-300/30 bg-amber-300/10 text-amber-100";
  }

  if (status === "En almuerzo") {
    return "border-amber-300/30 bg-amber-300/10 text-amber-100";
  }

  if (status === "Trabajando") {
    return "border-sky-300/30 bg-sky-300/10 text-sky-100";
  }

  return "border-[#3A3A36] bg-[#2D2E2A] text-[#CFCFCB]";
}

function formatDateTime(value?: string) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-EC", {
    timeZone: HORARIOS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function formatDate(value?: string) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-EC", {
    timeZone: HORARIOS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function amountClasses(value: number) {
  if (value < 0) {
    return "text-red-300";
  }

  if (value > 0) {
    return "text-[#D7FF4F]";
  }

  return "text-[#CFCFCB]";
}

function buildEmpleadoRegistrosVista(detalle: HorarioAdminEmpleadoDetalle): HorarioPeriodoRegistroItem[] {
  const registrosEnPeriodos = new Set(detalle.periodos.flatMap((periodo) => periodo.registroIds));

  return detalle.jornadas.map((registro) => ({
    ...registro,
    incluidoEnPeriodo: registrosEnPeriodos.has(registro.id)
  }));
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

  const returnTo = `/horarios/admin/empleados/${detalle.empleado.empleadoRecordId}`;
  const registrosVista = buildEmpleadoRegistrosVista(detalle);

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
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#8F908A]">Expediente laboral</p>
              <h2 className="mt-0.5 text-xl font-semibold text-[#F5F5F5]">{detalle.empleado.empleado}</h2>
              <p className="mt-0.5 text-sm text-[#A7A7A7]">{detalle.empleado.correo || detalle.empleado.usuarioId}</p>
              <div className="mt-3 grid gap-2 text-sm text-[#CFCFCB] sm:grid-cols-2 xl:grid-cols-5">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#8F908A]">Cedula</p>
                  <p className="font-semibold text-[#F5F5F5]">{detalle.empleado.cedula || "--"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#8F908A]">Rol</p>
                  <p className="font-semibold text-[#F5F5F5]">{detalle.empleado.rol || "--"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#8F908A]">Estado</p>
                  <p className={`font-semibold ${detalle.empleado.activo === false ? "text-red-200" : "text-[#D7FF4F]"}`}>
                    {detalle.empleado.activo === false ? "Inactivo" : "Activo"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#8F908A]">Activo desde</p>
                  <p className="font-semibold text-[#F5F5F5]">{formatDate(detalle.empleado.activoDesde)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#8F908A]">Ultimo login</p>
                  <p className="font-semibold text-[#F5F5F5]">{formatDateTime(detalle.empleado.ultimoLogin)}</p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {detalle.periodos[0] ? (
                <Link
                  href={`/horarios/admin/periodos/${detalle.periodos[0].id}`}
                  className="inline-flex h-fit w-fit rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-4 py-2 text-sm font-semibold text-[#10110E] transition hover:brightness-105"
                >
                  Gestionar periodo actual
                </Link>
              ) : null}
              <Link
                href="/horarios/admin"
                className="inline-flex h-fit w-fit rounded-full border border-[#3A3A36] px-4 py-2 text-sm font-semibold text-[#CFCFCB] transition hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F]"
              >
                Ver panel general
              </Link>
            </div>
          </div>
        </section>

        {/* Métricas */}
        <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-4">
          <EmpleadoMetricCard
            label="Saldo pendiente"
            value={formatMoney(detalle.resumen.saldoPendiente)}
            helper="Periodos abiertos y jornadas sin periodo"
            accent={detalle.resumen.saldoPendiente > 0}
          />
          <EmpleadoMetricCard
            label="Total pagado"
            value={formatMoney(detalle.resumen.totalPagado)}
            helper={`${detalle.resumen.pagosCount} pago${detalle.resumen.pagosCount !== 1 ? "s" : ""} activo${detalle.resumen.pagosCount !== 1 ? "s" : ""}`}
          />
          <EmpleadoMetricCard
            label="Horas registradas"
            value={formatHours(detalle.resumen.totalHorasRegistradas)}
            helper={`${detalle.resumen.jornadasCount} jornada${detalle.resumen.jornadasCount !== 1 ? "s" : ""} registradas`}
          />
          <EmpleadoMetricCard
            label="Generado registrado"
            value={formatMoney(detalle.resumen.totalGeneradoRegistrado)}
            helper="Suma historica de jornadas"
          />
          <EmpleadoMetricCard
            label="Ajustes aplicados"
            value={formatMoney(detalle.resumen.totalAjustes)}
            helper={`Bonos ${formatMoney(detalle.resumen.totalBonos)} / descuentos ${formatMoney(detalle.resumen.totalDescuentos)}`}
            warn={detalle.resumen.totalAjustes < 0}
          />
          <EmpleadoMetricCard
            label="Jornadas sin periodo"
            value={String(detalle.resumen.jornadasPendientesCount)}
            helper="Finalizadas o revisadas pendientes de agrupar"
            warn={detalle.resumen.jornadasPendientesCount > 0}
          />
          <EmpleadoMetricCard
            label="Periodos"
            value={String(detalle.resumen.periodosCount)}
            helper="Historial de periodos de pago"
          />
          <EmpleadoMetricCard
            label="Roles de pago"
            value={String(detalle.resumen.rolesPagoCount)}
            helper="PDF generados para el empleado"
          />
        </div>

        <HorarioPeriodoRegistrosClient
          registros={registrosVista}
          returnTo={returnTo}
          title="Jornadas del empleado"
          description="Historial de marcaciones con acceso directo a correccion administrativa."
          linkedLabel="En periodo"
          unlinkedLabel="Sin periodo"
          emptyTitle="No hay jornadas registradas para este empleado."
          emptyDescription="Las jornadas apareceran cuando el empleado marque asistencia."
        />

        {/* Periodos de pago */}
        <section className="overflow-hidden rounded-[1rem] border border-[#3A3A36] bg-[#252622]">
          <div className="border-b border-[#3A3A36] bg-[#30312D] px-4 py-3">
            <h2 className="text-base font-semibold text-[#F5F5F5]">Periodos de pago</h2>
            <p className="mt-0.5 text-xs text-[#A7A7A7]">Historial de periodos de pago de este empleado.</p>
          </div>
          {detalle.periodos.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-[1040px] w-full divide-y divide-[#3A3A36] text-left text-sm">
                <thead className="bg-[#30312D] text-[11px] uppercase tracking-wide text-[#8F908A]">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">Periodo</th>
                    <th className="px-3 py-2.5 font-semibold">Estado</th>
                    <th className="px-3 py-2.5 font-semibold">Horas</th>
                    <th className="px-3 py-2.5 font-semibold">Total neto</th>
                    <th className="px-3 py-2.5 font-semibold">Pagado</th>
                    <th className="px-3 py-2.5 font-semibold">Saldo neto</th>
                    <th className="px-3 py-2.5 font-semibold">Rol de pago</th>
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
                        {periodo.rolGenerado && periodo.rolPagoBlobPathname ? (
                          <a
                            href={`/api/horarios/roles/${periodo.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex rounded-full border border-[#D7FF4F]/30 px-2.5 py-1 text-xs font-semibold text-[#D7FF4F] transition hover:bg-[#D7FF4F] hover:text-[#10110E]"
                          >
                            Ver PDF
                          </a>
                        ) : (
                          <span className="text-xs text-[#8F908A]">Pendiente</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Link
                            href={`/horarios/admin/periodos/${periodo.id}`}
                            className="inline-flex rounded-full border border-[#D7FF4F]/30 px-2.5 py-1 text-xs font-semibold text-[#D7FF4F] transition hover:bg-[#D7FF4F] hover:text-[#10110E]"
                          >
                            Ver periodo
                          </Link>
                          <CerrarPeriodoHastaFechaButton
                            periodoId={periodo.id}
                            fechaInicio={periodo.fechaInicio}
                            fechaFin={periodo.fechaFin}
                            estadoPeriodo={periodo.estadoPeriodo}
                            totalHoras={periodo.totalHoras}
                            totalNeto={periodo.totalNeto}
                            saldoPendienteNeto={periodo.saldoPendienteNeto}
                            totalPagado={periodo.totalPagado}
                            jornadasCount={periodo.registros.length}
                          />
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

        {/* Roles de pago */}
        <section className="overflow-hidden rounded-[1rem] border border-[#3A3A36] bg-[#252622]">
          <div className="border-b border-[#3A3A36] bg-[#30312D] px-4 py-3">
            <h2 className="text-base font-semibold text-[#F5F5F5]">Roles de pago</h2>
            <p className="mt-0.5 text-xs text-[#A7A7A7]">PDF generados para periodos pagados o revisados.</p>
          </div>
          {detalle.rolesPago.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-[760px] w-full divide-y divide-[#3A3A36] text-left text-sm">
                <thead className="bg-[#30312D] text-[11px] uppercase tracking-wide text-[#8F908A]">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">Periodo</th>
                    <th className="px-3 py-2.5 font-semibold">Generado</th>
                    <th className="px-3 py-2.5 font-semibold">Estado</th>
                    <th className="px-3 py-2.5 font-semibold">Total neto</th>
                    <th className="px-3 py-2.5 font-semibold">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#3A3A36] text-[#CFCFCB]">
                  {detalle.rolesPago.map((rol) => (
                    <tr key={rol.periodoId} className="transition hover:bg-[#2D2E2A]">
                      <td className="px-3 py-2.5 text-[#F5F5F5]">
                        {rol.fechaInicio}
                        <span className="mx-1 text-[#8F908A]">→</span>
                        {rol.fechaFin}
                      </td>
                      <td className="px-3 py-2.5">{formatDateTime(rol.fechaGeneracionRol)}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses(String(rol.estadoRol))}`}>
                          {rol.estadoRol || "Generado"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-[#F5F5F5] tabular-nums">{formatMoney(rol.totalNeto)}</td>
                      <td className="px-3 py-2.5">
                        <a
                          href={`/api/horarios/roles/${rol.periodoId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex rounded-full border border-[#D7FF4F]/30 px-3 py-1.5 text-xs font-semibold text-[#D7FF4F] transition hover:bg-[#D7FF4F] hover:text-[#10110E]"
                        >
                          Ver PDF
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-medium text-[#CFCFCB]">No hay roles de pago generados.</p>
              <p className="mt-1 text-xs text-[#8F908A]">Se mostrarán aquí cuando se genere el PDF desde un periodo.</p>
            </div>
          )}
        </section>

        {/* Ajustes y amonestaciones */}
        <section className="overflow-hidden rounded-[1rem] border border-[#3A3A36] bg-[#252622]">
          <div className="border-b border-[#3A3A36] bg-[#30312D] px-4 py-3">
            <h2 className="text-base font-semibold text-[#F5F5F5]">Ajustes, descuentos y amonestaciones</h2>
            <p className="mt-0.5 text-xs text-[#A7A7A7]">Movimientos administrativos aplicados al empleado o a sus periodos.</p>
          </div>
          {detalle.ajustes.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-[980px] w-full divide-y divide-[#3A3A36] text-left text-sm">
                <thead className="bg-[#30312D] text-[11px] uppercase tracking-wide text-[#8F908A]">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">Fecha</th>
                    <th className="px-3 py-2.5 font-semibold">Tipo</th>
                    <th className="px-3 py-2.5 font-semibold">Horas</th>
                    <th className="px-3 py-2.5 font-semibold">Monto</th>
                    <th className="px-3 py-2.5 font-semibold">Motivo</th>
                    <th className="px-3 py-2.5 font-semibold">Estado</th>
                    <th className="px-3 py-2.5 font-semibold">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#3A3A36] text-[#CFCFCB]">
                  {detalle.ajustes.map((ajuste) => (
                    <tr key={ajuste.id} className="transition hover:bg-[#2D2E2A]">
                      <td className="px-3 py-2.5">{ajuste.fechaAjuste || "--"}</td>
                      <td className="px-3 py-2.5">
                        <p className="font-semibold text-[#F5F5F5]">{ajuste.tipoAjuste}</p>
                        {ajuste.aprobadoPor ? <p className="text-xs text-[#8F908A]">Por {ajuste.aprobadoPor}</p> : null}
                      </td>
                      <td className="px-3 py-2.5 font-semibold tabular-nums">{formatHours(ajuste.horasAjustadas)}</td>
                      <td className={`px-3 py-2.5 font-semibold tabular-nums ${amountClasses(ajuste.montoAjustado)}`}>
                        {formatMoney(ajuste.montoAjustado)}
                      </td>
                      <td className="max-w-[360px] px-3 py-2.5">
                        <p className="line-clamp-2">{ajuste.motivo || "--"}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses(ajuste.estado)}`}>
                          {ajuste.estado}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {ajuste.registroDelDiaId ? (
                          <Link
                            href={`/horarios/admin/jornadas/${ajuste.registroDelDiaId}?returnTo=${encodeURIComponent(returnTo)}`}
                            className="inline-flex rounded-full border border-[#D7FF4F]/30 px-3 py-1.5 text-xs font-semibold text-[#D7FF4F] transition hover:bg-[#D7FF4F] hover:text-[#10110E]"
                          >
                            Ver jornada
                          </Link>
                        ) : ajuste.periodoPagoId ? (
                          <Link
                            href={`/horarios/admin/periodos/${ajuste.periodoPagoId}`}
                            className="inline-flex rounded-full border border-[#3A3A36] px-3 py-1.5 text-xs font-semibold text-[#CFCFCB] transition hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F]"
                          >
                            Ver periodo
                          </Link>
                        ) : (
                          <span className="text-xs text-[#8F908A]">--</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-medium text-[#CFCFCB]">No hay ajustes registrados para este empleado.</p>
              <p className="mt-1 text-xs text-[#8F908A]">Los descuentos, bonos y amonestaciones aparecerán aquí cuando se apliquen.</p>
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
              <table className="min-w-[820px] w-full divide-y divide-[#3A3A36] text-left text-sm">
                <thead className="bg-[#30312D] text-[11px] uppercase tracking-wide text-[#8F908A]">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">Fecha</th>
                    <th className="px-3 py-2.5 font-semibold">Periodo</th>
                    <th className="px-3 py-2.5 font-semibold">Monto</th>
                    <th className="px-3 py-2.5 font-semibold">Método</th>
                    <th className="px-3 py-2.5 font-semibold">Transacción</th>
                    <th className="px-3 py-2.5 font-semibold">Estado</th>
                    <th className="px-3 py-2.5 font-semibold">Comprobante</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#3A3A36] text-[#CFCFCB]">
                  {detalle.pagos.map((pago) => (
                    <tr key={pago.id} className="transition hover:bg-[#2D2E2A]">
                      <td className="px-3 py-2.5">{pago.fechaPago}</td>
                      <td className="px-3 py-2.5">
                        {pago.periodoFechaInicio && pago.periodoFechaFin ? (
                          <span>
                            {pago.periodoFechaInicio}
                            <span className="mx-1 text-[#8F908A]">→</span>
                            {pago.periodoFechaFin}
                          </span>
                        ) : (
                          <span className="text-[#8F908A]">--</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-[#D7FF4F] tabular-nums">{formatMoney(pago.montoPagado)}</td>
                      <td className="px-3 py-2.5">{pago.metodoPago || "--"}</td>
                      <td className="px-3 py-2.5">{pago.numeroTransaccion || "--"}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses(String(pago.estadoPago))}`}>
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

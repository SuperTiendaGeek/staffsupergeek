import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AnularPagoHorarioButton } from "@/components/horarios/AnularPagoHorarioButton";
import { HorarioPeriodoPagoClient } from "@/components/horarios/HorarioPeriodoPagoClient";
import { RolPagoPeriodoClient } from "@/components/horarios/RolPagoPeriodoClient";
import { PortalShell } from "@/components/PortalShell";
import { isAdministratorRole } from "@/lib/apps";
import { fetchPeriodoPagoById } from "@/lib/horarios/airtable";
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

  return "border-white/10 bg-white/[0.05] text-zinc-300";
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

  const metrics = [
    { label: "Total horas", value: formatHours(periodo.totalHoras) },
    { label: "Total ganado", value: formatMoney(periodo.totalGanado) },
    { label: "Total pagado", value: formatMoney(periodo.totalPagado) },
    { label: "Saldo pendiente", value: formatMoney(periodo.saldoPendiente) }
  ];

  return (
    <PortalShell
      eyebrow="Administración"
      title="Periodo de pago"
      description="Detalle de registros vinculados y pagos del periodo."
    >
      <section className="w-full max-w-6xl space-y-5 text-left">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/horarios/admin" className="text-sm font-semibold text-geek-lime transition hover:text-white">
            Volver a horarios y pagos
          </Link>
          <HorarioPeriodoPagoClient periodoId={periodo.id} />
        </div>

        <section className="rounded-lg border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/20 backdrop-blur">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm text-zinc-400">Empleado</p>
              <h2 className="mt-1 text-2xl font-semibold text-white">{periodo.empleado}</h2>
              <p className="mt-1 text-sm text-zinc-500">{periodo.correo || periodo.usuarioId}</p>
              <p className="mt-4 text-sm text-zinc-300">{periodo.fechaInicio} - {periodo.fechaFin}</p>
            </div>
            <span className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold ${statusClasses(periodo.estadoPeriodo)}`}>
              {periodo.estadoPeriodo}
            </span>
          </div>
        </section>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-lg border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/20 backdrop-blur">
              <p className="text-sm text-zinc-400">{metric.label}</p>
              <p className="mt-2 text-2xl font-semibold text-white">{metric.value}</p>
            </div>
          ))}
        </div>

        <RolPagoPeriodoClient periodoId={periodo.id} rolGenerado={periodo.rolGenerado} rolPagoBlobPathname={periodo.rolPagoBlobPathname} />

        <section className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.035] shadow-2xl shadow-black/20 backdrop-blur">
          <div className="border-b border-white/10 px-4 py-4">
            <h2 className="text-lg font-semibold text-white">Registros diarios</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-white/[0.04] text-xs uppercase text-zinc-400">
                <tr>
                  <th className="px-4 py-3 font-semibold">Fecha</th>
                  <th className="px-4 py-3 font-semibold">Entrada</th>
                  <th className="px-4 py-3 font-semibold">Salida final</th>
                  <th className="px-4 py-3 font-semibold">Horas</th>
                  <th className="px-4 py-3 font-semibold">Total día</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {periodo.registros.length ? (
                  periodo.registros.map((registro) => (
                    <tr key={registro.id} className="text-zinc-200">
                      <td className="px-4 py-4">{registro.fecha}</td>
                      <td className="px-4 py-4">{formatTime(registro.entrada)}</td>
                      <td className="px-4 py-4">{formatTime(registro.salidaFinal)}</td>
                      <td className="px-4 py-4 font-semibold text-white">{formatHours(registro.horasTrabajadas)}</td>
                      <td className="px-4 py-4 font-semibold text-geek-lime">{formatMoney(registro.totalEstimadoDia)}</td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold ${statusClasses(registro.estadoDia)}`}>
                          {registro.estadoDia}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                      No hay registros vinculados al periodo.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.035] shadow-2xl shadow-black/20 backdrop-blur">
          <div className="border-b border-white/10 px-4 py-4">
            <h2 className="text-lg font-semibold text-white">Pagos registrados</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-white/[0.04] text-xs uppercase text-zinc-400">
                <tr>
                  <th className="px-4 py-3 font-semibold">Fecha</th>
                  <th className="px-4 py-3 font-semibold">Monto</th>
                  <th className="px-4 py-3 font-semibold">Método</th>
                  <th className="px-4 py-3 font-semibold">Transacción</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold">Comprobante</th>
                  <th className="px-4 py-3 font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {periodo.pagos.length ? (
                  periodo.pagos.map((pago) => (
                    <tr key={pago.id} className="text-zinc-200">
                      <td className="px-4 py-4">{pago.fechaPago}</td>
                      <td className="px-4 py-4 font-semibold text-geek-lime">{formatMoney(pago.montoPagado)}</td>
                      <td className="px-4 py-4">{pago.metodoPago || "--"}</td>
                      <td className="px-4 py-4">
                        <p>{pago.numeroTransaccion || "--"}</p>
                        {pago.bancoCuentaOrigen ? <p className="text-xs text-zinc-500">{pago.bancoCuentaOrigen}</p> : null}
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold ${pago.estadoPago === "Anulado" ? "border-red-300/30 bg-red-300/10 text-red-100" : "border-geek-lime/30 bg-geek-lime/10 text-geek-lime"}`}>
                          {pago.estadoPago}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        {pago.comprobantes.length ? (
                          <a href={pago.comprobantes[0].url} target="_blank" rel="noreferrer" className="font-semibold text-geek-lime hover:text-white">
                            Ver comprobante
                          </a>
                        ) : (
                          <span className="text-zinc-500">--</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        {pago.estadoPago === "Registrado" ? (
                          <AnularPagoHorarioButton periodoId={periodo.id} pagoId={pago.id} />
                        ) : (
                          <span className="text-zinc-500">--</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-zinc-400">
                      Aún no hay pagos registrados para este periodo.
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

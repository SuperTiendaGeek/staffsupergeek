"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { HorarioAjuste, HorarioEmpleadoResumenPagos, HorarioEmpleadoVista, HorarioEstado, HorarioPago, HorarioRegistro, TipoMarcacion } from "@/types/horarios";

type HorariosClientProps = {
  initialEstado: HorarioEstado | null;
  initialMiVista: HorarioEmpleadoVista | null;
  initialError?: string;
  isAdmin: boolean;
};

type EstadoResponse = {
  success?: boolean;
  error?: string;
  estado?: HorarioEstado;
};

const tipoLabels: Record<TipoMarcacion, string> = {
  entrada: "Entrada",
  salida_almuerzo: "Salida al almuerzo",
  regreso_almuerzo: "Regreso del almuerzo",
  salida_final: "Salida final",
  ajuste_admin: "Ajuste admin"
};

const HORARIOS_TIME_ZONE = "America/Guayaquil";

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

function formatDate(value?: string) {
  if (!value) {
    return "--";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");

    return `${day}/${month}/${year}`;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return new Intl.DateTimeFormat("es-EC", {
    timeZone: HORARIOS_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD"
  }).format(value);
}

function formatHours(value: number) {
  return `${value.toFixed(2)} h`;
}

function statusClasses(status?: string) {
  if (status === "Finalizado") {
    return "border-geek-lime/30 bg-geek-lime/10 text-geek-lime";
  }

  if (status === "En almuerzo") {
    return "border-amber-300/30 bg-amber-300/10 text-amber-100";
  }

  if (status === "Trabajando") {
    return "border-sky-300/30 bg-sky-300/10 text-sky-100";
  }

  return "border-white/10 bg-white/[0.05] text-zinc-300";
}

function paymentStatusClasses(status: HorarioEmpleadoResumenPagos["estadoGeneral"]) {
  if (status === "Pagado") {
    return "border-geek-lime/30 bg-geek-lime/10 text-geek-lime";
  }

  if (status === "Parcialmente pagado") {
    return "border-amber-300/30 bg-amber-300/10 text-amber-100";
  }

  if (status === "Sin pagos registrados") {
    return "border-sky-300/30 bg-sky-300/10 text-sky-100";
  }

  return "border-white/10 bg-white/[0.05] text-zinc-300";
}

function SummaryMetric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-[#30312D] bg-[#171814] px-3 py-2 shadow-lg shadow-black/10">
      <p className="text-[12px] font-bold uppercase tracking-normal text-[#8F908A]">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold leading-none ${accent ? "text-geek-lime" : "text-white"}`}>{value}</p>
    </div>
  );
}

function EstadoPagoSection({ resumenPagos, tieneJornadasMes }: { resumenPagos: HorarioEmpleadoResumenPagos; tieneJornadasMes: boolean }) {
  const ultimoPago =
    resumenPagos.ultimoPagoMonto !== null
      ? `${formatMoney(resumenPagos.ultimoPagoMonto)} · ${formatDate(resumenPagos.ultimoPagoFecha || undefined)}`
      : "Sin pagos registrados";
  const hasPeriodos = resumenPagos.periodosRegistrados > 0;

  return (
    <section className="rounded-xl border border-[#30312D] bg-[#171814] p-3 shadow-2xl shadow-black/20">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Estado de pago</h2>
          <p className="mt-1 text-sm text-zinc-400">Periodos de pago creados por administración.</p>
        </div>
        <span className={`inline-flex w-fit rounded-md border px-2.5 py-1 text-xs font-semibold ${paymentStatusClasses(resumenPagos.estadoGeneral)}`}>
          {resumenPagos.estadoGeneral}
        </span>
      </div>
      {!hasPeriodos ? (
        <p className="mt-4 rounded-md border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-300">
          Aún no hay periodos de pago registrados.
        </p>
      ) : null}
      {!hasPeriodos && tieneJornadasMes ? (
        <p className="mt-3 text-sm text-zinc-400">
          Tus jornadas trabajadas aparecerán en Estado de pago cuando administración cree un periodo de pago.
        </p>
      ) : null}
      <div className="mt-3 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryMetric label="Ganado en periodos" value={formatMoney(resumenPagos.totalGanadoPeriodos)} accent />
        <SummaryMetric label="Pagado en periodos" value={formatMoney(resumenPagos.totalPagadoPeriodos)} />
        <SummaryMetric label="Pendiente por cobrar" value={formatMoney(resumenPagos.saldoPendientePeriodos)} accent={resumenPagos.saldoPendientePeriodos > 0} />
        <SummaryMetric label="Último pago" value={ultimoPago} />
      </div>
    </section>
  );
}

function JornadasTable({ jornadas }: { jornadas: HorarioRegistro[] }) {
  if (!jornadas.length) {
    return <p className="py-4 text-sm text-zinc-400">No hay jornadas registradas en el periodo actual.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[900px] w-full text-left text-sm">
        <thead className="border-b border-white/10 text-xs uppercase tracking-normal text-zinc-500">
          <tr>
            <th className="px-3 py-3 font-medium">Fecha</th>
            <th className="px-3 py-3 font-medium">Entrada</th>
            <th className="px-3 py-3 font-medium">Salida almuerzo</th>
            <th className="px-3 py-3 font-medium">Regreso almuerzo</th>
            <th className="px-3 py-3 font-medium">Salida final</th>
            <th className="px-3 py-3 font-medium">Horas</th>
            <th className="px-3 py-3 font-medium">Total día</th>
            <th className="px-3 py-3 font-medium">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10 text-zinc-300">
          {jornadas.map((jornada) => (
            <tr key={jornada.id}>
              <td className="px-3 py-3 font-medium text-white">{formatDate(jornada.fecha)}</td>
              <td className="px-3 py-3">{formatTime(jornada.entrada)}</td>
              <td className="px-3 py-3">{formatTime(jornada.salidaAlmuerzo)}</td>
              <td className="px-3 py-3">{formatTime(jornada.regresoAlmuerzo)}</td>
              <td className="px-3 py-3">{formatTime(jornada.salidaFinal)}</td>
              <td className="px-3 py-3">{formatHours(jornada.horasTrabajadas)}</td>
              <td className="px-3 py-3 font-semibold text-geek-lime">{formatMoney(jornada.totalEstimadoDia)}</td>
              <td className="px-3 py-3">
                <span className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold ${statusClasses(jornada.estadoDia)}`}>
                  {jornada.estadoDia}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PagosTable({ pagos }: { pagos: HorarioPago[] }) {
  if (!pagos.length) {
    return <p className="py-4 text-sm text-zinc-400">Aún no hay pagos registrados para tu usuario.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[1080px] w-full text-left text-sm">
        <thead className="border-b border-white/10 text-xs uppercase tracking-normal text-zinc-500">
          <tr>
            <th className="px-3 py-3 font-medium">Fecha de pago</th>
            <th className="px-3 py-3 font-medium">Periodo</th>
            <th className="px-3 py-3 font-medium">Monto pagado</th>
            <th className="px-3 py-3 font-medium">Método</th>
            <th className="px-3 py-3 font-medium">Transacción</th>
            <th className="px-3 py-3 font-medium">Banco / Cuenta Origen</th>
            <th className="px-3 py-3 font-medium">Estado</th>
            <th className="px-3 py-3 font-medium">Comprobante</th>
            <th className="px-3 py-3 font-medium">Rol</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10 text-zinc-300">
          {pagos.map((pago) => {
            const comprobante = pago.comprobantes[0];
            const periodo = pago.periodoFechaInicio && pago.periodoFechaFin
              ? `${formatDate(pago.periodoFechaInicio)} - ${formatDate(pago.periodoFechaFin)}`
              : "--";
            const hasRol = Boolean(pago.periodoPagoId && pago.periodoRolGenerado && pago.periodoRolPagoBlobPathname);

            return (
              <tr key={pago.id}>
                <td className="px-3 py-3 font-medium text-white">{formatDate(pago.fechaPago)}</td>
                <td className="px-3 py-3">{periodo}</td>
                <td className="px-3 py-3 font-semibold text-geek-lime">{formatMoney(pago.montoPagado)}</td>
                <td className="px-3 py-3">{pago.metodoPago || "--"}</td>
                <td className="px-3 py-3">{pago.numeroTransaccion || "--"}</td>
                <td className="px-3 py-3">{pago.bancoCuentaOrigen || "--"}</td>
                <td className="px-3 py-3">
                  <span className="inline-flex rounded-md border border-geek-lime/30 bg-geek-lime/10 px-2.5 py-1 text-xs font-semibold text-geek-lime">
                    {pago.estadoPago || "Registrado"}
                  </span>
                </td>
                <td className="px-3 py-3">
                  {comprobante ? (
                    <a
                      href={comprobante.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-geek-lime transition hover:text-white"
                    >
                      Ver archivo
                    </a>
                  ) : (
                    "--"
                  )}
                </td>
                <td className="px-3 py-3">
                  {hasRol ? (
                    <a
                      href={`/api/horarios/roles/${pago.periodoPagoId}`}
                      className="inline-flex rounded-md border border-geek-lime/40 px-3 py-2 text-sm font-semibold text-geek-lime transition hover:border-geek-lime hover:bg-geek-lime hover:text-geek-black"
                    >
                      Descargar rol
                    </a>
                  ) : (
                    <span className="text-zinc-500">Pendiente</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AjustesTable({ ajustes }: { ajustes: HorarioAjuste[] }) {
  if (!ajustes.length) {
    return <p className="py-4 text-sm text-zinc-400">No hay ajustes ni descuentos registrados para tus periodos.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[720px] w-full text-left text-sm">
        <thead className="border-b border-white/10 text-xs uppercase tracking-normal text-zinc-500">
          <tr>
            <th className="px-3 py-3 font-medium">Fecha</th>
            <th className="px-3 py-3 font-medium">Motivo</th>
            <th className="px-3 py-3 font-medium">Horas descontadas</th>
            <th className="px-3 py-3 font-medium">Monto descontado</th>
            <th className="px-3 py-3 font-medium">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10 text-zinc-300">
          {ajustes.map((ajuste) => (
            <tr key={ajuste.id}>
              <td className="px-3 py-3 font-medium text-white">{formatDate(ajuste.fechaAjuste)}</td>
              <td className="px-3 py-3">{ajuste.motivo || "--"}</td>
              <td className="px-3 py-3">{formatHours(Math.abs(ajuste.horasAjustadas || ajuste.minutosAjustados / 60))}</td>
              <td className="px-3 py-3 font-semibold text-red-100">{formatMoney(ajuste.montoAjustado)}</td>
              <td className="px-3 py-3">
                <span className="inline-flex rounded-md border border-geek-lime/30 bg-geek-lime/10 px-2.5 py-1 text-xs font-semibold text-geek-lime">
                  {ajuste.estado || "Aplicado"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HorariosClient({ initialEstado, initialMiVista, initialError, isAdmin }: HorariosClientProps) {
  const router = useRouter();
  const [estado, setEstado] = useState(initialEstado);
  const [error, setError] = useState(initialError || "");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const registro = estado?.registro;
  const estadoDia = registro?.estadoDia || "Pendiente";
  const siguienteMarcacion = estado?.siguienteMarcacion;
  const miResumen = initialMiVista?.resumen;
  const resumenPagos = initialMiVista?.resumenPagos;
  const misJornadas = initialMiVista?.jornadas || [];
  const misAjustes = initialMiVista?.ajustes || [];
  const misPagos = initialMiVista?.pagos || [];

  const marcas = useMemo(
    () => [
      { label: "Entrada", value: registro?.entrada },
      { label: "Salida almuerzo", value: registro?.salidaAlmuerzo },
      { label: "Regreso almuerzo", value: registro?.regresoAlmuerzo },
      { label: "Salida final", value: registro?.salidaFinal }
    ],
    [registro]
  );

  async function refreshEstado() {
    const response = await fetch("/api/horarios/estado", {
      credentials: "same-origin"
    });
    const result = (await response.json()) as EstadoResponse;

    if (!response.ok || !result.success || !result.estado) {
      throw new Error(result.error || "No se pudo actualizar el estado");
    }

    setEstado(result.estado);
    router.refresh();
  }

  async function handleMarcar() {
    if (!siguienteMarcacion) {
      return;
    }

    setError("");
    setNotice("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/horarios/marcar", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: siguienteMarcacion })
      });
      const result = (await response.json()) as EstadoResponse;

      if (!response.ok || !result.success || !result.estado) {
        setError(result.error || "No se pudo registrar la marcación");
        return;
      }

      setEstado(result.estado);
      setNotice("Marcación registrada correctamente");
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="w-full space-y-2.5 text-left">
      <div className="flex flex-col gap-2 rounded-xl border border-[#30312D] bg-[#151613] px-3 py-2 shadow-xl shadow-black/20 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-zinc-400">Fecha operativa</p>
          <p className="text-lg font-semibold text-white">{estado?.fecha || "Hoy"}</p>
        </div>
        <div className="flex gap-1.5">
          {isAdmin ? (
            <Link
              href="/horarios/admin"
              className="rounded-lg border border-[#3A3A36] bg-[#252622] px-3 py-2 text-sm font-bold text-zinc-200 transition hover:border-geek-lime/50 hover:text-geek-lime"
            >
              Vista admin
            </Link>
          ) : null}
          <button
            type="button"
            onClick={refreshEstado}
            className="rounded-lg border border-[#3A3A36] bg-[#252622] px-3 py-2 text-sm font-bold text-zinc-200 transition hover:border-geek-lime/50 hover:text-geek-lime"
          >
            Actualizar
          </button>
        </div>
      </div>

      {notice ? (
        <p className="rounded-xl border border-geek-lime/30 bg-geek-lime/10 px-3 py-2.5 text-sm text-geek-lime" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2.5 text-sm text-red-100" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid gap-2.5 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-xl border border-[#30312D] bg-[#171814] p-3 shadow-2xl shadow-black/20">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <span className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold ${statusClasses(estadoDia)}`}>
                {estadoDia}
              </span>
              <h2 className="mt-2 text-xl font-semibold text-white">Control de horario</h2>
              <p className="mt-1 max-w-xl text-sm leading-5 text-zinc-300">
                La hora registrada se toma desde el servidor para proteger la integridad de cada marcación.
              </p>
            </div>
            <div className="rounded-xl border border-geek-lime/20 bg-geek-lime/10 px-3 py-2 text-right">
              <p className="text-xs text-zinc-300">Valor hora</p>
              <p className="text-xl font-semibold text-geek-lime">{formatMoney(estado?.resumen.valorHora || 3.0125)}</p>
            </div>
          </div>

          <button
            type="button"
            disabled={!estado?.puedeMarcar || !siguienteMarcacion || isSubmitting}
            onClick={handleMarcar}
            className="mt-3 w-full rounded-lg bg-geek-lime px-4 py-3 text-base font-semibold text-geek-black shadow-glow transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "Registrando..." : estado?.siguienteEtiqueta || "Sin acciones pendientes"}
          </button>

          <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {marcas.map((marca) => (
              <div key={marca.label} className="rounded-xl border border-[#30312D] bg-[#11120F] px-3 py-2">
                <p className="text-[12px] font-bold uppercase tracking-normal text-[#8F908A]">{marca.label}</p>
                <p className="mt-0.5 text-lg font-semibold text-white">{formatTime(marca.value)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-[#30312D] bg-[#171814] p-3 shadow-2xl shadow-black/20">
          <h2 className="text-lg font-semibold text-white">Resumen del día</h2>
          <div className="mt-3 space-y-2.5">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <span className="text-sm text-zinc-400">Horas trabajadas</span>
              <span className="font-semibold text-white">{formatHours(estado?.resumen.horasTrabajadas || 0)}</span>
            </div>
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <span className="text-sm text-zinc-400">Minutos trabajados</span>
              <span className="font-semibold text-white">{estado?.resumen.minutosTrabajados || 0}</span>
            </div>
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <span className="text-sm text-zinc-400">Sueldo base</span>
              <span className="font-semibold text-white">{formatMoney(estado?.resumen.sueldoBase || 482)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-400">Total estimado</span>
              <span className="text-xl font-semibold text-geek-lime">{formatMoney(estado?.resumen.totalEstimadoDia || 0)}</span>
            </div>
          </div>
        </section>
      </div>

      {miResumen ? (
        <section className="rounded-xl border border-[#30312D] bg-[#171814] p-3 shadow-2xl shadow-black/20">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Mi resumen</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Resumen del mes actual: {formatDate(miResumen.periodoJornadas.fechaInicio)} - {formatDate(miResumen.periodoJornadas.fechaFin)}
              </p>
            </div>
          </div>
          <div className="mt-3 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            <SummaryMetric label="Horas hoy" value={formatHours(miResumen.hoy.horasTrabajadas)} />
            <SummaryMetric label="Total hoy" value={formatMoney(miResumen.hoy.totalEstimado)} accent />
            <SummaryMetric label="Horas semana" value={formatHours(miResumen.semana.horasTrabajadas)} />
            <SummaryMetric label="Total semana" value={formatMoney(miResumen.semana.totalEstimado)} accent />
            <SummaryMetric label="Horas mes" value={formatHours(miResumen.mes.horasTrabajadas)} />
            <SummaryMetric label="Total mes" value={formatMoney(miResumen.mes.totalEstimado)} accent />
          </div>
        </section>
      ) : null}

      {resumenPagos ? <EstadoPagoSection resumenPagos={resumenPagos} tieneJornadasMes={(miResumen?.mes.totalEstimado || 0) > 0} /> : null}

      <section className="rounded-xl border border-[#30312D] bg-[#171814] p-3 shadow-2xl shadow-black/20">
        <h2 className="text-lg font-semibold text-white">Ajustes y descuentos del periodo</h2>
        <div className="mt-2">
          <AjustesTable ajustes={misAjustes} />
        </div>
      </section>

      <section className="rounded-xl border border-[#30312D] bg-[#171814] p-3 shadow-2xl shadow-black/20">
        <h2 className="text-lg font-semibold text-white">Mis jornadas</h2>
        <div className="mt-2">
          <JornadasTable jornadas={misJornadas} />
        </div>
      </section>

      <section className="rounded-xl border border-[#30312D] bg-[#171814] p-3 shadow-2xl shadow-black/20">
        <h2 className="text-lg font-semibold text-white">Mis pagos</h2>
        <div className="mt-2">
          <PagosTable pagos={misPagos} />
        </div>
      </section>

      <section className="rounded-xl border border-[#30312D] bg-[#171814] p-3 shadow-2xl shadow-black/20">
        <h2 className="text-lg font-semibold text-white">Historial de marcaciones</h2>
        <div className="mt-2 divide-y divide-white/10">
          {estado?.marcaciones.length ? (
            estado.marcaciones.map((marcacion) => (
              <div key={marcacion.id} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="font-medium text-white">{tipoLabels[marcacion.tipo]}</p>
                  <p className="text-xs text-zinc-500">{marcacion.origen || "portal_staff"}</p>
                </div>
                <p className="text-sm font-semibold text-zinc-200">{formatTime(marcacion.fechaHora)}</p>
              </div>
            ))
          ) : (
            <p className="py-4 text-sm text-zinc-400">Aún no hay marcaciones registradas hoy.</p>
          )}
        </div>
      </section>
    </section>
  );
}

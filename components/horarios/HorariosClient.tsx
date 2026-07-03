"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { HorarioAjuste, HorarioEmpleadoResumenPagos, HorarioEmpleadoVista, HorarioEstado, HorarioPago, HorarioPeriodoPago, HorarioRegistro, TipoMarcacion } from "@/types/horarios";

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
  if (!value) return "--:--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: HORARIOS_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function formatDate(value?: string) {
  if (!value) return "--";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("es-EC", {
    timeZone: HORARIOS_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(value);
}

function formatHours(value: number) {
  return `${value.toFixed(2)} h`;
}

function formatSignedHours(value: number) {
  if (value === 0) return "--";
  const sign = value > 0 ? "+" : "-";
  return `${sign}${Math.abs(value).toFixed(2)} h`;
}

function ajusteTipoLabel(ajuste: HorarioAjuste) {
  if (ajuste.tipoAjuste === "Compra empleado") {
    return "Descuento por compra empleado";
  }

  return ajuste.tipoAjuste || "Descuento";
}

function ajusteMontoClasses(monto: number) {
  if (monto < 0) return "text-red-200";
  if (monto > 0) return "text-[#D7FF4F]";
  return "text-[#CFCFCB]";
}

function formatShortDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  return `${match[3]}/${match[2]}`;
}

function statusClasses(status?: string) {
  if (status === "Finalizado" || status === "Revisado") {
    return "border-[#D7FF4F]/30 bg-[#D7FF4F]/10 text-[#D7FF4F]";
  }
  if (status === "En almuerzo") {
    return "border-amber-300/30 bg-amber-300/10 text-amber-100";
  }
  if (status === "Trabajando") {
    return "border-sky-300/30 bg-sky-300/10 text-sky-100";
  }
  if (status === "Incompleto") {
    return "border-red-400/30 bg-red-400/10 text-red-200";
  }
  return "border-[#3A3A36] bg-[#2D2E2A] text-[#A7A7A7]";
}

function paymentStatusClasses(status: HorarioEmpleadoResumenPagos["estadoGeneral"]) {
  if (status === "Pagado") {
    return "border-[#D7FF4F]/30 bg-[#D7FF4F]/10 text-[#D7FF4F]";
  }
  if (status === "Parcialmente pagado") {
    return "border-amber-300/30 bg-amber-300/10 text-amber-100";
  }
  if (status === "Sin pagos registrados") {
    return "border-sky-300/30 bg-sky-300/10 text-sky-100";
  }
  return "border-[#3A3A36] bg-[#2D2E2A] text-[#A7A7A7]";
}

type EstadoPagoJornada = "sin-periodo" | "abierto" | "parcialmente-pagado" | "pagado" | "cerrado";

function getEstadoPagoJornada(registroId: string, registroToPeriodo: Map<string, HorarioPeriodoPago>): EstadoPagoJornada {
  const periodo = registroToPeriodo.get(registroId);
  if (!periodo) return "sin-periodo";
  const estado = periodo.estadoPeriodo;
  if (estado === "Pagado") return "pagado";
  if (estado === "Parcialmente pagado") return "parcialmente-pagado";
  if (estado === "Cerrado") return "cerrado";
  return "abierto";
}

function periodoBadgeProps(estadoPago: EstadoPagoJornada): { label: string; classes: string } {
  if (estadoPago === "sin-periodo") {
    return { label: "Sin periodo", classes: "border-amber-400/40 bg-amber-400/10 text-amber-200" };
  }
  if (estadoPago === "abierto") {
    return { label: "Pendiente", classes: "border-[#D7FF4F]/30 bg-[#D7FF4F]/10 text-[#D7FF4F]" };
  }
  if (estadoPago === "parcialmente-pagado") {
    return { label: "Parcialmente pagado", classes: "border-[#D7FF4F]/20 bg-[#D7FF4F]/5 text-[#D7FF4F]" };
  }
  if (estadoPago === "pagado") {
    return { label: "Pagado", classes: "border-[#3A3A36] bg-[#2D2E2A] text-[#A7A7A7]" };
  }
  return { label: "Cerrado", classes: "border-[#3A3A36] bg-[#2D2E2A] text-[#CFCFCB]" };
}

function SummaryMetric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2">
      <p className="text-[11px] font-bold uppercase tracking-wide text-[#8F908A]">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold leading-none ${accent ? "text-[#D7FF4F]" : "text-[#F5F5F5]"}`}>{value}</p>
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
    <div className="mb-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-[#F5F5F5]">Estado de pago</h3>
          <p className="text-sm text-[#A7A7A7]">Periodos de pago creados por administración.</p>
        </div>
        <span className={`inline-flex w-fit shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${paymentStatusClasses(resumenPagos.estadoGeneral)}`}>
          {resumenPagos.estadoGeneral}
        </span>
      </div>
      {!hasPeriodos ? (
        <p className="mb-3 rounded-xl border border-[#3A3A36] bg-[#1E1F1C] px-4 py-3 text-sm text-[#CFCFCB]">
          Aún no hay periodos de pago registrados.
          {tieneJornadasMes ? " Tus jornadas trabajadas aparecerán aquí cuando administración cree un periodo." : ""}
        </p>
      ) : null}
      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryMetric label="Ganado en periodos" value={formatMoney(resumenPagos.totalGanadoPeriodos)} accent />
        <SummaryMetric label="Pagado en periodos" value={formatMoney(resumenPagos.totalPagadoPeriodos)} />
        <SummaryMetric
          label="Pendiente por cobrar"
          value={formatMoney(resumenPagos.saldoPendientePeriodos)}
          accent={resumenPagos.saldoPendientePeriodos > 0}
        />
        <SummaryMetric label="Último pago" value={ultimoPago} />
      </div>
      <p className="mt-2 text-[11px] text-[#8F908A]">
        Saldo calculado sobre periodos de pago registrados. No incluye jornadas que aún no han sido agrupadas en un periodo.
      </p>
    </div>
  );
}

function JornadasTable({ jornadas, registroToPeriodo }: { jornadas: HorarioRegistro[]; registroToPeriodo: Map<string, HorarioPeriodoPago> }) {
  if (!jornadas.length) {
    return (
      <div className="rounded-xl border border-[#3A3A36] bg-[#1E1F1C] py-8 text-center">
        <p className="text-sm text-[#A7A7A7]">No hay jornadas registradas en los últimos 6 meses.</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[1080px] w-full text-left text-sm">
        <thead className="border-b border-[#3A3A36] text-xs uppercase tracking-normal text-[#8F908A]">
          <tr>
            <th className="px-3 py-2.5 font-medium">Fecha</th>
            <th className="px-3 py-2.5 font-medium">Entrada</th>
            <th className="px-3 py-2.5 font-medium">Salida almuerzo</th>
            <th className="px-3 py-2.5 font-medium">Regreso almuerzo</th>
            <th className="px-3 py-2.5 font-medium">Salida final</th>
            <th className="px-3 py-2.5 font-medium">Horas</th>
            <th className="px-3 py-2.5 font-medium">Generado</th>
            <th className="px-3 py-2.5 font-medium">Estado</th>
            <th className="px-3 py-2.5 font-medium">Estado de pago</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#3A3A36] text-[#CFCFCB]">
          {jornadas.map((jornada) => {
            const estadoPago = getEstadoPagoJornada(jornada.id, registroToPeriodo);
            const { label: badgeLabel, classes: badgeClasses } = periodoBadgeProps(estadoPago);
            const periodo = registroToPeriodo.get(jornada.id);
            const isPagado = estadoPago === "pagado";
            return (
              <tr key={jornada.id} className={`transition hover:bg-[#2D2E2A] ${isPagado ? "opacity-60" : ""}`}>
                <td className="px-3 py-2.5 font-medium text-[#F5F5F5]">{formatDate(jornada.fecha)}</td>
                <td className="px-3 py-2.5">{formatTime(jornada.entrada)}</td>
                <td className="px-3 py-2.5">{formatTime(jornada.salidaAlmuerzo)}</td>
                <td className="px-3 py-2.5">{formatTime(jornada.regresoAlmuerzo)}</td>
                <td className="px-3 py-2.5">{formatTime(jornada.salidaFinal)}</td>
                <td className="px-3 py-2.5">{formatHours(jornada.horasTrabajadas)}</td>
                <td className="px-3 py-2.5 font-semibold text-[#D7FF4F]">{formatMoney(jornada.totalEstimadoDia)}</td>
                <td className="px-3 py-2.5">
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses(jornada.estadoDia)}`}>
                    {jornada.estadoDia}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-col gap-1">
                    {periodo ? (
                      <span className="text-[11px] text-[#A7A7A7]">
                        {formatShortDate(periodo.fechaInicio)} – {formatShortDate(periodo.fechaFin)}
                      </span>
                    ) : null}
                    <span className={`inline-flex w-fit rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badgeClasses}`}>
                      {badgeLabel}
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PagosTable({ pagos }: { pagos: HorarioPago[] }) {
  if (!pagos.length) {
    return (
      <div className="rounded-xl border border-[#3A3A36] bg-[#1E1F1C] py-8 text-center">
        <p className="text-sm text-[#A7A7A7]">Aún no hay pagos registrados para tu usuario.</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[1080px] w-full text-left text-sm">
        <thead className="border-b border-[#3A3A36] text-xs uppercase tracking-normal text-[#8F908A]">
          <tr>
            <th className="px-3 py-2.5 font-medium">Fecha de pago</th>
            <th className="px-3 py-2.5 font-medium">Periodo</th>
            <th className="px-3 py-2.5 font-medium">Monto pagado</th>
            <th className="px-3 py-2.5 font-medium">Método</th>
            <th className="px-3 py-2.5 font-medium">Transacción</th>
            <th className="px-3 py-2.5 font-medium">Banco / Cuenta Origen</th>
            <th className="px-3 py-2.5 font-medium">Estado</th>
            <th className="px-3 py-2.5 font-medium">Comprobante</th>
            <th className="px-3 py-2.5 font-medium">Rol</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#3A3A36] text-[#CFCFCB]">
          {pagos.map((pago) => {
            const comprobante = pago.comprobantes[0];
            const periodo =
              pago.periodoFechaInicio && pago.periodoFechaFin
                ? `${formatDate(pago.periodoFechaInicio)} - ${formatDate(pago.periodoFechaFin)}`
                : "--";
            const hasRol = Boolean(pago.periodoPagoId && pago.periodoRolGenerado && pago.periodoRolPagoBlobPathname);
            return (
              <tr key={pago.id} className="transition hover:bg-[#2D2E2A]">
                <td className="px-3 py-2.5 font-medium text-[#F5F5F5]">{formatDate(pago.fechaPago)}</td>
                <td className="px-3 py-2.5">{periodo}</td>
                <td className="px-3 py-2.5 font-semibold text-[#D7FF4F]">{formatMoney(pago.montoPagado)}</td>
                <td className="px-3 py-2.5">{pago.metodoPago || "--"}</td>
                <td className="px-3 py-2.5">{pago.numeroTransaccion || "--"}</td>
                <td className="px-3 py-2.5">{pago.bancoCuentaOrigen || "--"}</td>
                <td className="px-3 py-2.5">
                  <span className="inline-flex rounded-full border border-[#D7FF4F]/30 bg-[#D7FF4F]/10 px-2.5 py-1 text-xs font-semibold text-[#D7FF4F]">
                    {pago.estadoPago || "Registrado"}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  {comprobante ? (
                    <a
                      href={comprobante.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-[#D7FF4F] transition hover:text-[#F5F5F5]"
                    >
                      Ver archivo
                    </a>
                  ) : (
                    "--"
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {hasRol ? (
                    <a
                      href={`/api/horarios/roles/${pago.periodoPagoId}`}
                      className="inline-flex rounded-full border border-[#D7FF4F]/40 px-3 py-1.5 text-xs font-semibold text-[#D7FF4F] transition hover:bg-[#D7FF4F] hover:text-[#10110E]"
                    >
                      Descargar rol
                    </a>
                  ) : (
                    <span className="text-[#A7A7A7]">Pendiente</span>
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
    return (
      <div className="rounded-xl border border-[#3A3A36] bg-[#1E1F1C] py-8 text-center">
        <p className="text-sm text-[#A7A7A7]">No hay ajustes ni descuentos registrados para tus periodos.</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[820px] w-full text-left text-sm">
        <thead className="border-b border-[#3A3A36] text-xs uppercase tracking-normal text-[#8F908A]">
          <tr>
            <th className="px-3 py-2.5 font-medium">Fecha</th>
            <th className="px-3 py-2.5 font-medium">Tipo</th>
            <th className="px-3 py-2.5 font-medium">Motivo</th>
            <th className="px-3 py-2.5 font-medium">Horas</th>
            <th className="px-3 py-2.5 font-medium">Monto</th>
            <th className="px-3 py-2.5 font-medium">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#3A3A36] text-[#CFCFCB]">
          {ajustes.map((ajuste) => (
            <tr key={ajuste.id} className="transition hover:bg-[#2D2E2A]">
              <td className="px-3 py-2.5 font-medium text-[#F5F5F5]">{formatDate(ajuste.fechaAjuste)}</td>
              <td className="px-3 py-2.5">{ajusteTipoLabel(ajuste)}</td>
              <td className="px-3 py-2.5">{ajuste.motivo || "--"}</td>
              <td className="px-3 py-2.5">{formatSignedHours(ajuste.horasAjustadas || ajuste.minutosAjustados / 60)}</td>
              <td className={`px-3 py-2.5 font-semibold ${ajusteMontoClasses(ajuste.montoAjustado)}`}>{formatMoney(ajuste.montoAjustado)}</td>
              <td className="px-3 py-2.5">
                <span className="inline-flex rounded-full border border-[#D7FF4F]/30 bg-[#D7FF4F]/10 px-2.5 py-1 text-xs font-semibold text-[#D7FF4F]">
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
  const [activeTab, setActiveTab] = useState<"jornadas" | "pagos" | "ajustes">("jornadas");
  const [isHistorialOpen, setIsHistorialOpen] = useState(false);

  const registro = estado?.registro;
  const estadoDia = registro?.estadoDia || "Pendiente";
  const siguienteMarcacion = estado?.siguienteMarcacion;
  const miResumen = initialMiVista?.resumen;
  const resumenPagos = initialMiVista?.resumenPagos;
  const misJornadas = initialMiVista?.jornadas || [];
  const misAjustes = initialMiVista?.ajustes || [];
  const misPagos = initialMiVista?.pagos || [];
  const misPeriodos = initialMiVista?.periodos || [];

  const registroToPeriodo = useMemo(() => {
    const map = new Map<string, HorarioPeriodoPago>();
    for (const periodo of misPeriodos) {
      for (const registroId of periodo.registroIds) {
        map.set(registroId, periodo);
      }
    }
    return map;
  }, [misPeriodos]);

  const marcas = useMemo(
    () => [
      { label: "Entrada", tipo: "entrada" as TipoMarcacion, value: registro?.entrada },
      { label: "Salida almuerzo", tipo: "salida_almuerzo" as TipoMarcacion, value: registro?.salidaAlmuerzo },
      { label: "Regreso almuerzo", tipo: "regreso_almuerzo" as TipoMarcacion, value: registro?.regresoAlmuerzo },
      { label: "Salida final", tipo: "salida_final" as TipoMarcacion, value: registro?.salidaFinal }
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

  const tabs: { id: "jornadas" | "pagos" | "ajustes"; label: string }[] = [
    { id: "jornadas", label: "Jornadas" },
    { id: "pagos", label: "Pagos" },
    { id: "ajustes", label: "Ajustes" }
  ];

  return (
    <section className="w-full space-y-4 text-left">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-[#A7A7A7]">Fecha operativa</p>
          <p className="text-lg font-semibold text-[#F5F5F5]">{estado?.fecha || "Hoy"}</p>
        </div>
        <div className="flex gap-2">
          {isAdmin ? (
            <Link
              href="/horarios/admin"
              className="rounded-full border border-[#3A3A36] px-3 py-1.5 text-sm font-semibold text-[#CFCFCB] transition hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F]"
            >
              Vista admin
            </Link>
          ) : null}
          <button
            type="button"
            onClick={refreshEstado}
            className="rounded-full border border-[#3A3A36] px-3 py-1.5 text-sm font-semibold text-[#CFCFCB] transition hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F]"
          >
            Actualizar
          </button>
        </div>
      </div>

      {/* Banners */}
      {notice ? (
        <p className="rounded-xl border border-[#D7FF4F]/30 bg-[#D7FF4F]/10 px-3 py-2.5 text-sm text-[#D7FF4F]" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2.5 text-sm text-red-200" role="alert">
          {error}
        </p>
      ) : null}

      {/* Hero card */}
      <div className="rounded-[1rem] border border-[#3A3A36] bg-[#252622] p-5">
        {/* Estado + próxima acción */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <span className={`inline-flex w-fit rounded-full border px-3 py-1 text-sm font-semibold ${statusClasses(estadoDia)}`}>
              {estadoDia}
            </span>
            {estado?.puedeMarcar && estado.siguienteEtiqueta ? (
              <p className="text-sm text-[#CFCFCB]">
                Próxima marcación:{" "}
                <span className="font-semibold text-[#D7FF4F]">{estado.siguienteEtiqueta}</span>
              </p>
            ) : estadoDia === "Incompleto" ? (
              <p className="text-sm font-medium text-red-300">Jornada incompleta — contacta a administración.</p>
            ) : (
              <p className="text-sm text-[#8F908A]">Sin acciones pendientes para hoy.</p>
            )}
          </div>
          <div className="shrink-0 rounded-xl border border-[#D7FF4F]/20 bg-[#D7FF4F]/5 px-3 py-1.5 text-right">
            <p className="text-[11px] text-[#A7A7A7]">Valor hora</p>
            <p className="text-lg font-semibold text-[#D7FF4F]">{formatMoney(estado?.resumen.valorHora ?? 3.0125)}</p>
          </div>
        </div>

        {/* Marks grid */}
        <p className="mt-4 text-[11px] font-bold uppercase tracking-wider text-[#8F908A]">Marcaciones del día</p>
        <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {marcas.map((marca) => {
            const isRegistered = Boolean(marca.value);
            const isNext = marca.tipo === siguienteMarcacion && (estado?.puedeMarcar ?? false);
            return (
              <div
                key={marca.label}
                className={`rounded-xl border px-3 py-2.5 transition ${
                  isRegistered
                    ? "border-[#D7FF4F]/25 bg-[#1E1F1C]"
                    : isNext
                      ? "border-[#D7FF4F]/35 bg-[#D7FF4F]/5"
                      : "border-[#3A3A36] bg-[#1E1F1C]"
                }`}
              >
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#8F908A]">{marca.label}</p>
                <p
                  className={`mt-0.5 text-lg font-semibold ${
                    isRegistered ? "text-[#F5F5F5]" : isNext ? "text-[#D7FF4F]" : "text-[#A7A7A7]"
                  }`}
                >
                  {formatTime(marca.value)}
                </p>
                {isRegistered ? (
                  <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#D7FF4F]/70">Registrado</p>
                ) : isNext ? (
                  <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#D7FF4F]">Próxima</p>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* Stats */}
        {estado?.resumen ? (
          <>
            <p className="mt-3 text-[11px] font-bold uppercase tracking-wider text-[#8F908A]">Resumen de hoy</p>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#8F908A]">Horas</p>
                <p className="mt-0.5 text-lg font-semibold text-[#F5F5F5]">{formatHours(estado.resumen.horasTrabajadas)}</p>
              </div>
              <div className="rounded-xl border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#8F908A]">Total generado</p>
                <p className="mt-0.5 text-lg font-semibold text-[#D7FF4F]">{formatMoney(estado.resumen.totalEstimadoDia)}</p>
              </div>
            </div>
          </>
        ) : null}

        {/* CTA */}
        <button
          type="button"
          disabled={!estado?.puedeMarcar || !siguienteMarcacion || isSubmitting}
          onClick={handleMarcar}
          className="mt-4 w-full rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-4 py-3 text-base font-semibold text-[#10110E] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? "Registrando..." : estado?.siguienteEtiqueta || "Sin acciones pendientes"}
        </button>

        {/* Collapsible historial */}
        <button
          type="button"
          onClick={() => setIsHistorialOpen(!isHistorialOpen)}
          className="mt-3 flex w-full items-center justify-between gap-2 rounded-xl px-1 py-1 text-sm text-[#CFCFCB] transition hover:text-[#F5F5F5]"
        >
          <span className="flex items-center gap-2">
            Historial de hoy
            {estado?.marcaciones.length ? (
              <span className="rounded-full bg-[#3A3A36] px-1.5 py-0.5 text-[10px] font-semibold text-[#CFCFCB]">
                {estado.marcaciones.length}
              </span>
            ) : null}
          </span>
          <svg
            className={`h-4 w-4 transition-transform duration-200 ${isHistorialOpen ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {isHistorialOpen ? (
          <div className="mt-1 divide-y divide-[#3A3A36]">
            {estado?.marcaciones.length ? (
              estado.marcaciones.map((marcacion) => (
                <div key={marcacion.id} className="flex items-center justify-between gap-4 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-[#F5F5F5]">{tipoLabels[marcacion.tipo]}</p>
                    <p className="text-xs text-[#A7A7A7]">{marcacion.origen || "portal_staff"}</p>
                  </div>
                  <p className="text-sm font-semibold text-[#CFCFCB]">{formatTime(marcacion.fechaHora)}</p>
                </div>
              ))
            ) : (
              <p className="py-3 text-sm text-[#A7A7A7]">Aún no hay marcaciones registradas hoy.</p>
            )}
          </div>
        ) : null}
      </div>

      {/* Compact metrics */}
      {miResumen || resumenPagos ? (
        <div className="grid gap-2 sm:grid-cols-3">
          {/* Slot 1: Esta semana — productividad, no pendiente */}
          {miResumen ? (
            <div className="rounded-xl border border-[#3A3A36] bg-[#252622] px-3 py-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#8F908A]">Esta semana</p>
              <p className="mt-0.5 text-sm font-semibold text-[#F5F5F5]">
                {formatHours(miResumen.semana.horasTrabajadas)}
              </p>
              <p className="text-sm font-semibold text-[#D7FF4F]">{formatMoney(miResumen.semana.totalEstimado)} generado</p>
            </div>
          ) : null}
          {/* Slot 2: Saldo pendiente — métrica financiera principal */}
          {resumenPagos ? (
            <div
              className={`rounded-xl border px-3 py-2.5 ${
                resumenPagos.saldoPendientePeriodos > 0
                  ? "border-[#D7FF4F]/30 bg-[#D7FF4F]/5"
                  : "border-[#3A3A36] bg-[#252622]"
              }`}
            >
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#8F908A]">Saldo pendiente</p>
              <p
                className={`mt-0.5 text-lg font-semibold ${
                  resumenPagos.saldoPendientePeriodos > 0 ? "text-[#D7FF4F]" : "text-[#F5F5F5]"
                }`}
              >
                {formatMoney(resumenPagos.saldoPendientePeriodos)}
              </p>
              <p className="mt-1 text-[10px] leading-tight text-[#8F908A]">Saldo calculado sobre periodos de pago registrados.</p>
            </div>
          ) : null}
          {/* Slot 3: Último pago si existe, sino horas del mes (sin dinero) */}
          {resumenPagos && resumenPagos.ultimoPagoMonto !== null ? (
            <div className="rounded-xl border border-[#3A3A36] bg-[#252622] px-3 py-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#8F908A]">Último pago</p>
              <p className="mt-0.5 text-sm font-semibold text-[#F5F5F5]">{formatMoney(resumenPagos.ultimoPagoMonto)}</p>
              <p className="text-[10px] text-[#8F908A]">{formatDate(resumenPagos.ultimoPagoFecha || undefined)}</p>
            </div>
          ) : miResumen ? (
            <div className="rounded-xl border border-[#3A3A36] bg-[#252622] px-3 py-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#8F908A]">Este mes</p>
              <p className="mt-0.5 text-sm font-semibold text-[#F5F5F5]">
                {formatHours(miResumen.mes.horasTrabajadas)}
              </p>
              <p className="text-[10px] text-[#8F908A]">Solo horas trabajadas</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Tabs card */}
      <div className="overflow-hidden rounded-[1rem] border border-[#3A3A36] bg-[#252622]">
        <div className="flex border-b border-[#3A3A36] bg-[#30312D]">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${
                activeTab === tab.id
                  ? "border-[#D7FF4F] text-[#D7FF4F]"
                  : "border-transparent text-[#A7A7A7] hover:text-[#CFCFCB]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="p-4">
          {activeTab === "jornadas" ? (
            <>
              <p className="mb-3 text-[12px] leading-relaxed text-[#8F908A]">
                Últimos 6 meses de jornadas. El estado de pago refleja el periodo al que pertenece cada jornada, no el pago individual por día.
              </p>
              <JornadasTable jornadas={misJornadas} registroToPeriodo={registroToPeriodo} />
            </>
          ) : null}
          {activeTab === "pagos" ? (
            <>
              {resumenPagos ? (
                <EstadoPagoSection
                  resumenPagos={resumenPagos}
                  tieneJornadasMes={(miResumen?.mes.totalEstimado || 0) > 0}
                />
              ) : null}
              <PagosTable pagos={misPagos} />
            </>
          ) : null}
          {activeTab === "ajustes" ? <AjustesTable ajustes={misAjustes} /> : null}
        </div>
      </div>
    </section>
  );
}

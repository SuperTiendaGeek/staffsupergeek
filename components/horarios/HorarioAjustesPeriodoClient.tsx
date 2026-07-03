"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import type {
  HorarioAjuste,
  HorarioImpactoAjuste,
  HorarioPeriodoPagoDetalle,
  HorarioRegistro,
  HorarioTipoAjuste,
  HorarioTipoCalculoAjuste
} from "@/types/horarios";
import { HORARIO_TIPOS_AJUSTE } from "@/types/horarios";

type HorarioAjustesPeriodoClientProps = {
  periodo: HorarioPeriodoPagoDetalle;
};

type AjusteResponse = {
  success?: boolean;
  error?: string;
  ajuste?: HorarioAjuste;
  periodo?: HorarioPeriodoPagoDetalle;
  ajustesPeriodo?: HorarioAjuste[];
  ajustesEmpleado?: HorarioAjuste[];
};

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
    return value;
  }

  return new Intl.DateTimeFormat("es-EC", {
    timeZone: "America/Guayaquil",
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

function formatSignedHours(value: number) {
  if (value === 0) return "--";
  const sign = value > 0 ? "+" : "-";
  return `${sign}${Math.abs(value).toFixed(2)} h`;
}

function statusClasses(status?: string) {
  if (status === "Aplicado") {
    return "border-[#D7FF4F]/30 bg-[#D7FF4F]/10 text-[#D7FF4F]";
  }
  return "border-[#3A3A36] bg-[#2D2E2A] text-[#CFCFCB]";
}

function montoClasses(monto: number) {
  if (monto < 0) return "text-red-300";
  if (monto > 0) return "text-[#D7FF4F]";
  return "text-[#CFCFCB]";
}

const INPUT_CLASSES =
  "h-9 w-full rounded-xl border border-[#3A3A36] bg-[#1E1F1C] px-3 text-sm text-[#F5F5F5] outline-none transition placeholder:text-[#8F908A] focus:border-[#D7FF4F]/60";

const SELECT_OPTION_CLASSES = "bg-[#1E1F1C]";

const TIPOS_HORAS_PERMITIDOS = new Set<HorarioTipoAjuste>(["Descuento", "Corrección de hora", "Regularización", "Otro"]);
const TIPOS_MONTO_CON_IMPACTO = new Set<HorarioTipoAjuste>(["Corrección de hora", "Regularización", "Otro"]);

function supportsHoras(tipoAjuste: HorarioTipoAjuste) {
  return TIPOS_HORAS_PERMITIDOS.has(tipoAjuste);
}

function requiresMontoImpacto(tipoAjuste: HorarioTipoAjuste) {
  return TIPOS_MONTO_CON_IMPACTO.has(tipoAjuste);
}

function formatPeriodoLabel(ajuste: HorarioAjuste) {
  if (ajuste.periodoFechaInicio && ajuste.periodoFechaFin) {
    return `${formatDate(ajuste.periodoFechaInicio)} - ${formatDate(ajuste.periodoFechaFin)}`;
  }

  return ajuste.periodoPagoId ? "Periodo vinculado" : "Sin periodo";
}

function getRegistroLabel(ajuste: HorarioAjuste, registrosById: Map<string, HorarioRegistro>) {
  if (!ajuste.registroDelDiaId) {
    return "Sin jornada relacionada";
  }

  const registro = registrosById.get(ajuste.registroDelDiaId);
  return registro ? `${formatDate(registro.fecha)} · ${registro.horasTrabajadas.toFixed(2)} h` : "Jornada relacionada";
}

type AjustesTableProps = {
  ajustes: HorarioAjuste[];
  registrosById: Map<string, HorarioRegistro>;
  periodoActualId: string;
  showPeriodo?: boolean;
  showRegistro?: boolean;
  showAprobadoPor?: boolean;
  emptyTitle: string;
  emptyDescription: string;
};

function AjustesTable({
  ajustes,
  registrosById,
  periodoActualId,
  showPeriodo = false,
  showRegistro = false,
  showAprobadoPor = false,
  emptyTitle,
  emptyDescription
}: AjustesTableProps) {
  if (!ajustes.length) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-sm font-medium text-[#CFCFCB]">{emptyTitle}</p>
        <p className="mt-1 text-xs text-[#8F908A]">{emptyDescription}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[1040px] w-full divide-y divide-[#3A3A36] text-left text-sm">
        <thead className="bg-[#30312D] text-[11px] uppercase tracking-wide text-[#8F908A]">
          <tr>
            <th className="px-3 py-2.5 font-semibold">Fecha</th>
            {showPeriodo ? <th className="px-3 py-2.5 font-semibold">Periodo</th> : null}
            <th className="px-3 py-2.5 font-semibold">Tipo</th>
            <th className="px-3 py-2.5 font-semibold">Motivo</th>
            {showRegistro ? <th className="px-3 py-2.5 font-semibold">Jornada</th> : null}
            <th className="px-3 py-2.5 font-semibold">Horas</th>
            <th className="px-3 py-2.5 font-semibold">Monto</th>
            {showAprobadoPor ? <th className="px-3 py-2.5 font-semibold">Aprobado por</th> : null}
            <th className="px-3 py-2.5 font-semibold">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#3A3A36] text-[#CFCFCB]">
          {ajustes.map((ajuste) => {
            const isPeriodoActual = ajuste.periodoPagoId === periodoActualId;

            return (
              <tr key={ajuste.id} className="transition hover:bg-[#2D2E2A]">
                <td className="px-3 py-2.5 font-medium text-[#F5F5F5]">{formatDate(ajuste.fechaAjuste)}</td>
                {showPeriodo ? (
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span>{formatPeriodoLabel(ajuste)}</span>
                      {isPeriodoActual ? (
                        <span className="inline-flex rounded-full border border-[#D7FF4F]/25 bg-[#D7FF4F]/10 px-2 py-0.5 text-[11px] font-semibold text-[#D7FF4F]">
                          Periodo actual
                        </span>
                      ) : null}
                    </div>
                  </td>
                ) : null}
                <td className="px-3 py-2.5">{ajuste.tipoAjuste || "Descuento"}</td>
                <td className="px-3 py-2.5">{ajuste.motivo || "--"}</td>
                {showRegistro ? <td className="px-3 py-2.5">{getRegistroLabel(ajuste, registrosById)}</td> : null}
                <td className="px-3 py-2.5 tabular-nums">{formatSignedHours(ajuste.horasAjustadas || ajuste.minutosAjustados / 60)}</td>
                <td className={`px-3 py-2.5 font-semibold tabular-nums ${montoClasses(ajuste.montoAjustado)}`}>{formatMoney(ajuste.montoAjustado)}</td>
                {showAprobadoPor ? <td className="px-3 py-2.5">{ajuste.aprobadoPor || "--"}</td> : null}
                <td className="px-3 py-2.5">
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses(ajuste.estado)}`}>
                    {ajuste.estado || "Aplicado"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function HorarioAjustesPeriodoClient({ periodo }: HorarioAjustesPeriodoClientProps) {
  const router = useRouter();
  const [ajustesPeriodo, setAjustesPeriodo] = useState(periodo.ajustes);
  const [ajustesEmpleado, setAjustesEmpleado] = useState(periodo.ajustesEmpleado.length ? periodo.ajustesEmpleado : periodo.ajustes);
  const [tipoAjuste, setTipoAjuste] = useState<HorarioTipoAjuste>("Descuento");
  const [tipoCalculo, setTipoCalculo] = useState<HorarioTipoCalculoAjuste>("horas");
  const [horasAjustadas, setHorasAjustadas] = useState("");
  const [montoAjustado, setMontoAjustado] = useState("");
  const [impacto, setImpacto] = useState<HorarioImpactoAjuste>("resta");
  const [motivo, setMotivo] = useState("");
  const [registroId, setRegistroId] = useState("");
  const [relacionarJornada, setRelacionarJornada] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const valorHora = useMemo(() => {
    const registro = periodo.registros.find((item) => item.valorHora > 0);
    return registro?.valorHora || 0;
  }, [periodo.registros]);
  const registrosById = useMemo(() => new Map(periodo.registros.map((registro) => [registro.id, registro])), [periodo.registros]);
  const showImpacto = tipoCalculo === "monto" && requiresMontoImpacto(tipoAjuste);
  const showRegistroRelacionado = tipoCalculo === "horas" || relacionarJornada;

  function handleTipoAjusteChange(value: string) {
    const nextTipo = value as HorarioTipoAjuste;
    setTipoAjuste(nextTipo);

    if (!supportsHoras(nextTipo) && tipoCalculo === "horas") {
      setTipoCalculo("monto");
      setRegistroId("");
      setRelacionarJornada(false);
    }

    if (nextTipo === "Bono") {
      setImpacto("suma");
    } else if (nextTipo === "Compra empleado" || nextTipo === "Descuento") {
      setImpacto("resta");
    }
  }

  function handleTipoCalculoChange(value: HorarioTipoCalculoAjuste) {
    setTipoCalculo(value);

    if (value === "monto") {
      setRegistroId("");
      setRelacionarJornada(false);
    }
  }

  function handleRelacionarJornadaChange(checked: boolean) {
    setRelacionarJornada(checked);

    if (!checked) {
      setRegistroId("");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/horarios/admin/periodos/${periodo.id}/ajustes`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipoAjuste,
          tipoCalculo,
          horas: tipoCalculo === "horas" ? horasAjustadas : undefined,
          monto: tipoCalculo === "monto" ? montoAjustado : undefined,
          impacto: showImpacto ? impacto : undefined,
          motivo,
          registroId: showRegistroRelacionado && registroId ? registroId : undefined
        })
      });
      const result = (await response.json()) as AjusteResponse;

      if (!response.ok || !result.success || !result.ajuste) {
        setError(result.error || "No se pudo registrar el ajuste");
        return;
      }

      const ajusteRegistrado: HorarioAjuste = {
        ...result.ajuste,
        periodoFechaInicio: result.ajuste.periodoFechaInicio || periodo.fechaInicio,
        periodoFechaFin: result.ajuste.periodoFechaFin || periodo.fechaFin
      };

      if (result.periodo) {
        setAjustesPeriodo(result.periodo.ajustes);
        setAjustesEmpleado(result.periodo.ajustesEmpleado);
      } else {
        setAjustesPeriodo((current) => [ajusteRegistrado, ...current]);
        setAjustesEmpleado((current) => [ajusteRegistrado, ...current.filter((ajuste) => ajuste.id !== ajusteRegistrado.id)]);
      }

      setTipoAjuste("Descuento");
      setTipoCalculo("horas");
      setHorasAjustadas("");
      setMontoAjustado("");
      setImpacto("resta");
      setMotivo("");
      setRegistroId("");
      setRelacionarJornada(false);
      setNotice("Ajuste registrado correctamente.");
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-[1rem] border border-[#3A3A36] bg-[#252622]">
      {/* Header */}
      <div className="border-b border-[#3A3A36] bg-[#30312D] px-4 py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-[#F5F5F5]">Ajustes y amonestaciones</h2>
            <p className="mt-0.5 text-xs text-[#A7A7A7]">Registra descuentos, compras de empleado y bonos visibles en este periodo.</p>
          </div>
          {valorHora > 0 ? (
            <span className="inline-flex w-fit rounded-full border border-[#D7FF4F]/25 bg-[#D7FF4F]/10 px-3 py-1 text-xs font-semibold text-[#D7FF4F]">
              Valor hora: {formatMoney(valorHora)}
            </span>
          ) : null}
        </div>
      </div>

      {/* Formulario de nuevo ajuste */}
      <div className="px-4 py-4">
        {notice ? <p className="mb-3 rounded-xl border border-[#D7FF4F]/30 bg-[#D7FF4F]/10 px-3 py-2.5 text-sm font-medium text-[#D7FF4F]">{notice}</p> : null}
        {error ? <p className="mb-3 rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2.5 text-sm text-red-100">{error}</p> : null}

        <p className="text-[11px] font-bold uppercase tracking-wider text-[#8F908A]">Registrar nuevo ajuste</p>
        <form onSubmit={handleSubmit} className="mt-1.5 space-y-2">
          <div
            className={`grid gap-2 md:grid-cols-2 ${
              showImpacto ? "xl:grid-cols-[1fr_0.85fr_0.85fr_0.75fr_auto]" : "xl:grid-cols-[1fr_0.85fr_0.85fr_auto]"
            } xl:items-end`}
          >
            <label className="block space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wide text-[#8F908A]">Tipo de ajuste</span>
              <select value={tipoAjuste} onChange={(event) => handleTipoAjusteChange(event.target.value)} className={INPUT_CLASSES}>
                {HORARIO_TIPOS_AJUSTE.map((tipo) => (
                  <option key={tipo} value={tipo} className={SELECT_OPTION_CLASSES}>
                    {tipo}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wide text-[#8F908A]">Tipo de cálculo</span>
              <select value={tipoCalculo} onChange={(event) => handleTipoCalculoChange(event.target.value as HorarioTipoCalculoAjuste)} className={INPUT_CLASSES}>
                <option value="horas" disabled={!supportsHoras(tipoAjuste)} className={SELECT_OPTION_CLASSES}>
                  Horas
                </option>
                <option value="monto" className={SELECT_OPTION_CLASSES}>
                  Monto
                </option>
              </select>
            </label>
            {tipoCalculo === "horas" ? (
              <label className="block space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wide text-[#8F908A]">Horas a ajustar</span>
                <input
                  type="number"
                  min="0.25"
                  step="0.25"
                  value={horasAjustadas}
                  onChange={(event) => setHorasAjustadas(event.target.value)}
                  required
                  className={INPUT_CLASSES}
                  placeholder="1.00"
                />
              </label>
            ) : (
              <label className="block space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wide text-[#8F908A]">Monto a ajustar</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={montoAjustado}
                  onChange={(event) => setMontoAjustado(event.target.value)}
                  required
                  className={INPUT_CLASSES}
                  placeholder="50.00"
                />
              </label>
            )}
            {showImpacto ? (
              <label className="block space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wide text-[#8F908A]">Impacto</span>
                <select value={impacto} onChange={(event) => setImpacto(event.target.value as HorarioImpactoAjuste)} className={INPUT_CLASSES}>
                  <option value="resta" className={SELECT_OPTION_CLASSES}>Resta</option>
                  <option value="suma" className={SELECT_OPTION_CLASSES}>Suma</option>
                </select>
              </label>
            ) : null}
            <button
              type="submit"
              disabled={isSubmitting}
              className="h-9 rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-4 text-sm font-semibold text-[#10110E] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "Guardando..." : "Registrar"}
            </button>
          </div>
          <label className="block space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wide text-[#8F908A]">Motivo</span>
            <input
              type="text"
              value={motivo}
              onChange={(event) => setMotivo(event.target.value)}
              required
              className={INPUT_CLASSES}
              placeholder="Motivo visible para el empleado"
            />
          </label>
          {tipoCalculo === "horas" ? (
            <label className="block max-w-xl space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wide text-[#8F908A]">Registro relacionado</span>
              <select
                value={registroId}
                onChange={(event) => setRegistroId(event.target.value)}
                className={INPUT_CLASSES}
              >
                <option value="" className={SELECT_OPTION_CLASSES}>Sin registro específico</option>
                {periodo.registros.map((registro) => (
                  <option key={registro.id} value={registro.id} className={SELECT_OPTION_CLASSES}>
                    {formatDate(registro.fecha)} · {registro.horasTrabajadas.toFixed(2)} h
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="max-w-xl rounded-xl border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2.5">
              <label className="flex items-center gap-2 text-sm text-[#CFCFCB]">
                <input
                  type="checkbox"
                  checked={relacionarJornada}
                  onChange={(event) => handleRelacionarJornadaChange(event.target.checked)}
                  className="size-4 accent-[#D7FF4F]"
                />
                <span className="font-medium">Relacionar con una jornada específica</span>
                {!relacionarJornada ? <span className="ml-auto text-xs text-[#8F908A]">Sin registro específico</span> : null}
              </label>
              {relacionarJornada ? (
                <select
                  value={registroId}
                  onChange={(event) => setRegistroId(event.target.value)}
                  className={`${INPUT_CLASSES} mt-2`}
                >
                  <option value="" className={SELECT_OPTION_CLASSES}>Sin registro específico</option>
                  {periodo.registros.map((registro) => (
                    <option key={registro.id} value={registro.id} className={SELECT_OPTION_CLASSES}>
                      {formatDate(registro.fecha)} · {registro.horasTrabajadas.toFixed(2)} h
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          )}
        </form>
      </div>

      {/* Ajustes del periodo */}
      <div className="border-t border-[#3A3A36]">
        <div className="border-b border-[#3A3A36] bg-[#30312D] px-4 py-2.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#8F908A]">Ajustes de este periodo</p>
          <p className="mt-0.5 text-xs text-[#A7A7A7]">Estos valores afectan el total neto y el saldo pendiente de este rol.</p>
        </div>
        <AjustesTable
          ajustes={ajustesPeriodo}
          registrosById={registrosById}
          periodoActualId={periodo.id}
          showRegistro
          showAprobadoPor
          emptyTitle="No hay ajustes registrados para este periodo."
          emptyDescription="Los ajustes nuevos aparecerán aquí cuando afecten este rol."
        />
      </div>

      {/* Historial del empleado */}
      <div className="border-t border-[#3A3A36]">
        <div className="border-b border-[#3A3A36] bg-[#30312D] px-4 py-2.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#8F908A]">Historial del empleado</p>
          <p className="mt-0.5 text-xs text-[#A7A7A7]">Solo lectura. Los periodos anteriores no se suman a este rol.</p>
        </div>
        <AjustesTable
          ajustes={ajustesEmpleado}
          registrosById={registrosById}
          periodoActualId={periodo.id}
          showPeriodo
          emptyTitle="No hay ajustes registrados para este empleado."
          emptyDescription="Aquí se verán compras, bonos y descuentos de todos sus periodos."
        />
      </div>
    </section>
  );
}

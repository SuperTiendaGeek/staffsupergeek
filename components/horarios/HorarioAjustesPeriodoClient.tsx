"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import type { HorarioAjuste, HorarioPeriodoPagoDetalle } from "@/types/horarios";

type HorarioAjustesPeriodoClientProps = {
  periodo: HorarioPeriodoPagoDetalle;
};

type AjusteResponse = {
  success?: boolean;
  error?: string;
  ajuste?: HorarioAjuste;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD"
  }).format(value);
}

function formatHours(value: number) {
  return `${Math.abs(value).toFixed(2)} h`;
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

export function HorarioAjustesPeriodoClient({ periodo }: HorarioAjustesPeriodoClientProps) {
  const router = useRouter();
  const [ajustes, setAjustes] = useState(periodo.ajustes);
  const [horasDescontadas, setHorasDescontadas] = useState("");
  const [motivo, setMotivo] = useState("");
  const [registroId, setRegistroId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const valorHora = useMemo(() => {
    const registro = periodo.registros.find((item) => item.valorHora > 0);
    return registro?.valorHora || 0;
  }, [periodo.registros]);

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
          horasDescontadas,
          motivo,
          registroId: registroId || null
        })
      });
      const result = (await response.json()) as AjusteResponse;

      if (!response.ok || !result.success || !result.ajuste) {
        setError(result.error || "No se pudo registrar la amonestación");
        return;
      }

      setAjustes((current) => [result.ajuste as HorarioAjuste, ...current]);
      setHorasDescontadas("");
      setMotivo("");
      setRegistroId("");
      setNotice("Amonestación registrada correctamente.");
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
            <p className="mt-0.5 text-xs text-[#A7A7A7]">Registra descuentos visibles para el empleado dentro de este periodo.</p>
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
        <form onSubmit={handleSubmit} className="mt-1.5 grid gap-2 lg:grid-cols-[0.7fr_1.4fr_1fr_auto] lg:items-end">
          <label className="block space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wide text-[#8F908A]">Horas a descontar</span>
            <input
              type="number"
              min="0.25"
              step="0.25"
              value={horasDescontadas}
              onChange={(event) => setHorasDescontadas(event.target.value)}
              required
              className={INPUT_CLASSES}
              placeholder="1.00"
            />
          </label>
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
          <label className="block space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wide text-[#8F908A]">Registro relacionado</span>
            <select
              value={registroId}
              onChange={(event) => setRegistroId(event.target.value)}
              className={INPUT_CLASSES}
            >
              <option value="" className="bg-[#1E1F1C]">Sin registro específico</option>
              {periodo.registros.map((registro) => (
                <option key={registro.id} value={registro.id} className="bg-[#1E1F1C]">
                  {registro.fecha} · {registro.horasTrabajadas.toFixed(2)} h
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-4 py-2 text-sm font-semibold text-[#10110E] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "Guardando..." : "Registrar"}
          </button>
        </form>
      </div>

      {/* Historial de ajustes */}
      <div className="border-t border-[#3A3A36]">
        <div className="border-b border-[#3A3A36] bg-[#30312D] px-4 py-2.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#8F908A]">Historial de ajustes</p>
        </div>
        {ajustes.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full divide-y divide-[#3A3A36] text-left text-sm">
              <thead className="bg-[#30312D] text-[11px] uppercase tracking-wide text-[#8F908A]">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Fecha</th>
                  <th className="px-3 py-2.5 font-semibold">Motivo</th>
                  <th className="px-3 py-2.5 font-semibold">Horas</th>
                  <th className="px-3 py-2.5 font-semibold">Monto</th>
                  <th className="px-3 py-2.5 font-semibold">Aprobado por</th>
                  <th className="px-3 py-2.5 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#3A3A36] text-[#CFCFCB]">
                {ajustes.map((ajuste) => (
                  <tr key={ajuste.id} className="transition hover:bg-[#2D2E2A]">
                    <td className="px-3 py-2.5 font-medium text-[#F5F5F5]">{ajuste.fechaAjuste || "--"}</td>
                    <td className="px-3 py-2.5">{ajuste.motivo || "--"}</td>
                    <td className="px-3 py-2.5 tabular-nums">{formatHours(ajuste.horasAjustadas || ajuste.minutosAjustados / 60)}</td>
                    <td className={`px-3 py-2.5 font-semibold tabular-nums ${montoClasses(ajuste.montoAjustado)}`}>{formatMoney(ajuste.montoAjustado)}</td>
                    <td className="px-3 py-2.5">{ajuste.aprobadoPor || "--"}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses(ajuste.estado)}`}>
                        {ajuste.estado || "Aplicado"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-4 py-8 text-center">
            <p className="text-sm font-medium text-[#CFCFCB]">No hay ajustes registrados para este periodo.</p>
            <p className="mt-1 text-xs text-[#8F908A]">Usa el formulario de arriba para registrar un descuento o amonestación.</p>
          </div>
        )}
      </div>
    </section>
  );
}

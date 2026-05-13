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
    return "border-geek-lime/30 bg-geek-lime/10 text-geek-lime";
  }

  return "border-white/10 bg-white/[0.05] text-zinc-300";
}

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
    <section className="rounded-lg border border-white/10 bg-white/[0.035] p-5 shadow-2xl shadow-black/20 backdrop-blur">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Ajustes y amonestaciones</h2>
          <p className="mt-1 text-sm text-zinc-400">Registra descuentos visibles para el empleado dentro de este periodo.</p>
        </div>
        {valorHora > 0 ? (
          <span className="inline-flex w-fit rounded-md border border-geek-lime/25 bg-geek-lime/10 px-2.5 py-1 text-xs font-semibold text-geek-lime">
            Valor hora: {formatMoney(valorHora)}
          </span>
        ) : null}
      </div>

      {notice ? <p className="mt-4 rounded-md border border-geek-lime/30 bg-geek-lime/10 px-4 py-3 text-sm text-geek-lime">{notice}</p> : null}
      {error ? <p className="mt-4 rounded-md border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100">{error}</p> : null}

      <form onSubmit={handleSubmit} className="mt-5 grid gap-3 lg:grid-cols-[0.7fr_1.4fr_1fr_auto] lg:items-end">
        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-normal text-zinc-500">Horas a descontar</span>
          <input
            type="number"
            min="0.25"
            step="0.25"
            value={horasDescontadas}
            onChange={(event) => setHorasDescontadas(event.target.value)}
            required
            className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-geek-lime/60"
            placeholder="1.00"
          />
        </label>
        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-normal text-zinc-500">Motivo</span>
          <input
            type="text"
            value={motivo}
            onChange={(event) => setMotivo(event.target.value)}
            required
            className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-geek-lime/60"
            placeholder="Motivo visible para el empleado"
          />
        </label>
        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-normal text-zinc-500">Registro relacionado</span>
          <select
            value={registroId}
            onChange={(event) => setRegistroId(event.target.value)}
            className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white outline-none transition focus:border-geek-lime/60"
          >
            <option value="">Sin registro específico</option>
            {periodo.registros.map((registro) => (
              <option key={registro.id} value={registro.id}>
                {registro.fecha} · {registro.horasTrabajadas.toFixed(2)} h
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-geek-lime px-4 py-2.5 text-sm font-semibold text-geek-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Guardando..." : "Registrar"}
        </button>
      </form>

      <div className="mt-5 overflow-x-auto">
        <table className="min-w-[760px] w-full text-left text-sm">
          <thead className="border-b border-white/10 text-xs uppercase tracking-normal text-zinc-500">
            <tr>
              <th className="px-3 py-3 font-medium">Fecha</th>
              <th className="px-3 py-3 font-medium">Motivo</th>
              <th className="px-3 py-3 font-medium">Horas</th>
              <th className="px-3 py-3 font-medium">Monto</th>
              <th className="px-3 py-3 font-medium">Aprobado por</th>
              <th className="px-3 py-3 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10 text-zinc-300">
            {ajustes.length ? (
              ajustes.map((ajuste) => (
                <tr key={ajuste.id}>
                  <td className="px-3 py-3 font-medium text-white">{ajuste.fechaAjuste || "--"}</td>
                  <td className="px-3 py-3">{ajuste.motivo || "--"}</td>
                  <td className="px-3 py-3">{formatHours(ajuste.horasAjustadas || ajuste.minutosAjustados / 60)}</td>
                  <td className="px-3 py-3 font-semibold text-red-100">{formatMoney(ajuste.montoAjustado)}</td>
                  <td className="px-3 py-3">{ajuste.aprobadoPor || "--"}</td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold ${statusClasses(ajuste.estado)}`}>
                      {ajuste.estado || "Aplicado"}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-zinc-400">
                  No hay ajustes registrados para este periodo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

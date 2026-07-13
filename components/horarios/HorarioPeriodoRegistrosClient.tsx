"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { useMemo, useState } from "react";
import type { HorarioRegistro } from "@/types/horarios";

export type HorarioPeriodoRegistroItem = HorarioRegistro & {
  incluidoEnPeriodo: boolean;
};

type Props = {
  registros: HorarioPeriodoRegistroItem[];
  returnTo: string;
  title?: string;
  description?: string;
  linkedLabel?: string;
  unlinkedLabel?: string;
  emptyTitle?: string;
  emptyDescription?: string;
};

const HORARIOS_TIME_ZONE = "America/Guayaquil";
const PAGE_SIZE = 15;

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

  if (status === "Incompleto") {
    return "border-red-400/30 bg-red-400/10 text-red-200";
  }

  if (status === "En almuerzo") {
    return "border-amber-300/30 bg-amber-300/10 text-amber-100";
  }

  return "border-sky-300/30 bg-sky-300/10 text-sky-100";
}

function linkStatusClasses(incluidoEnPeriodo: boolean) {
  return incluidoEnPeriodo
    ? "border-[#D7FF4F]/30 bg-[#D7FF4F]/10 text-[#D7FF4F]"
    : "border-amber-300/30 bg-amber-300/10 text-amber-100";
}

export function HorarioPeriodoRegistrosClient({
  registros,
  returnTo,
  title = "Registros diarios",
  description = "Jornadas del rango del periodo para revision administrativa.",
  linkedLabel = "Incluido",
  unlinkedLabel = "En rango",
  emptyTitle = "No hay jornadas en el rango del periodo.",
  emptyDescription = "Cuando existan marcaciones para este empleado apareceran aqui."
}: Props) {
  const [page, setPage] = useState(1);
  const [fechaFiltro, setFechaFiltro] = useState("");

  const filteredRegistros = useMemo(() => {
    if (!fechaFiltro) {
      return registros;
    }

    return registros.filter((registro) => registro.fecha === fechaFiltro);
  }, [fechaFiltro, registros]);

  const totalPages = Math.max(1, Math.ceil(filteredRegistros.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * PAGE_SIZE;
  const visibleRegistros = filteredRegistros.slice(startIndex, startIndex + PAGE_SIZE);
  const firstVisible = filteredRegistros.length ? startIndex + 1 : 0;
  const lastVisible = Math.min(startIndex + visibleRegistros.length, filteredRegistros.length);

  function goToPreviousPage() {
    setPage((currentPage) => Math.max(1, currentPage - 1));
  }

  function goToNextPage() {
    setPage((currentPage) => Math.min(totalPages, currentPage + 1));
  }

  function handleDateFilterChange(value: string) {
    setFechaFiltro(value);
    setPage(1);
  }

  return (
    <section className="overflow-hidden rounded-[1rem] border border-[#3A3A36] bg-[#252622]">
      <div className="border-b border-[#3A3A36] bg-[#30312D] px-4 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-[#F5F5F5]">{title}</h2>
            <p className="mt-0.5 text-xs text-[#A7A7A7]">{description}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="space-y-1">
              <span className="text-[11px] font-bold uppercase text-[#8F908A]">Buscar fecha</span>
              <input
                type="date"
                value={fechaFiltro}
                onChange={(event) => handleDateFilterChange(event.target.value)}
                className="h-9 w-full rounded-xl border border-[#3A3A36] bg-[#1E1F1C] px-3 text-sm text-[#F5F5F5] outline-none transition focus:border-[#D7FF4F]/60 sm:w-40"
              />
            </label>
            {fechaFiltro ? (
              <button
                type="button"
                onClick={() => handleDateFilterChange("")}
                className="h-9 rounded-full border border-[#3A3A36] px-3 text-xs font-semibold text-[#CFCFCB] transition hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F]"
              >
                Limpiar
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {registros.length ? (
        <>
          {visibleRegistros.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-[1120px] w-full divide-y divide-[#3A3A36] text-left text-sm">
                <thead className="bg-[#30312D] text-[11px] uppercase text-[#8F908A]">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">Fecha</th>
                    <th className="px-3 py-2.5 font-semibold">Entrada</th>
                    <th className="px-3 py-2.5 font-semibold">Salida almuerzo</th>
                    <th className="px-3 py-2.5 font-semibold">Regreso almuerzo</th>
                    <th className="px-3 py-2.5 font-semibold">Salida final</th>
                    <th className="px-3 py-2.5 font-semibold">Horas</th>
                    <th className="px-3 py-2.5 font-semibold">Total día</th>
                    <th className="px-3 py-2.5 font-semibold">Estado</th>
                    <th className="px-3 py-2.5 font-semibold">Periodo</th>
                    <th className="px-3 py-2.5 font-semibold">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#3A3A36] text-[#CFCFCB]">
                  {visibleRegistros.map((registro) => (
                    <tr key={registro.id} className="transition hover:bg-[#2D2E2A]">
                      <td className="px-3 py-2.5 text-[#F5F5F5]">{registro.fecha}</td>
                      <td className="px-3 py-2.5 tabular-nums">{formatTime(registro.entrada)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{formatTime(registro.salidaAlmuerzo)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{formatTime(registro.regresoAlmuerzo)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{formatTime(registro.salidaFinal)}</td>
                      <td className="px-3 py-2.5 font-semibold text-[#F5F5F5] tabular-nums">{formatHours(registro.horasTrabajadas)}</td>
                      <td className="px-3 py-2.5 font-semibold text-[#D7FF4F] tabular-nums">{formatMoney(registro.totalEstimadoDia)}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses(registro.estadoDia)}`}>
                          {registro.estadoDia}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${linkStatusClasses(registro.incluidoEnPeriodo)}`}>
                          {registro.incluidoEnPeriodo ? linkedLabel : unlinkedLabel}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/horarios/admin/jornadas/${registro.id}?returnTo=${encodeURIComponent(returnTo)}`}
                          className="inline-flex items-center gap-1.5 rounded-full border border-[#D7FF4F]/30 px-3 py-1.5 text-xs font-semibold text-[#D7FF4F] transition hover:bg-[#D7FF4F] hover:text-[#10110E]"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          Corregir
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-medium text-[#CFCFCB]">No hay jornadas para la fecha seleccionada.</p>
              <p className="mt-1 text-xs text-[#8F908A]">Limpia el filtro para ver todo el periodo.</p>
            </div>
          )}

          <div className="flex flex-col gap-2 border-t border-[#3A3A36] bg-[#1E1F1C] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-medium text-[#A7A7A7]">
              Mostrando <span className="text-[#F5F5F5]">{firstVisible}</span>-<span className="text-[#F5F5F5]">{lastVisible}</span> de{" "}
              <span className="text-[#F5F5F5]">{filteredRegistros.length}</span>
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={goToPreviousPage}
                disabled={safePage <= 1}
                aria-label="Pagina anterior"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#3A3A36] text-[#F5F5F5] transition hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <span className="min-w-16 text-center text-sm font-semibold tabular-nums text-[#CFCFCB]">
                {safePage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={goToNextPage}
                disabled={safePage >= totalPages}
                aria-label="Pagina siguiente"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#3A3A36] text-[#F5F5F5] transition hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="px-4 py-8 text-center">
          <p className="text-sm font-medium text-[#CFCFCB]">{emptyTitle}</p>
          <p className="mt-1 text-xs text-[#8F908A]">{emptyDescription}</p>
        </div>
      )}
    </section>
  );
}

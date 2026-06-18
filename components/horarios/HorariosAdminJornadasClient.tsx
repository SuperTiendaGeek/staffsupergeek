"use client";

import Link from "next/link";
import type { HorarioRegistro } from "@/types/horarios";

type Props = {
  jornadas: HorarioRegistro[];
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

function formatHours(value: number) {
  return `${value.toFixed(2)} h`;
}

function statusClasses(status: string) {
  if (status === "Incompleto") {
    return "border-red-400/30 bg-red-400/10 text-red-200";
  }

  if (status === "En almuerzo") {
    return "border-amber-300/30 bg-amber-300/10 text-amber-100";
  }

  return "border-sky-300/30 bg-sky-300/10 text-sky-100";
}

export function HorariosAdminJornadasClient({ jornadas }: Props) {
  return (
    <section className="overflow-hidden rounded-[1rem] border border-[#3A3A36] bg-[#252622]">
      <div className="border-b border-[#3A3A36] bg-[#30312D] px-4 py-3">
        <h2 className="text-base font-semibold text-[#F5F5F5]">Jornadas por revisar</h2>
        <p className="mt-0.5 text-xs text-[#A7A7A7]">
          Jornadas en estado Trabajando, En almuerzo o Incompleto que requieren revisión manual.
        </p>
      </div>
      {jornadas.length ? (
        <div className="overflow-x-auto">
          <table className="min-w-[960px] w-full divide-y divide-[#3A3A36] text-left text-sm">
            <thead className="bg-[#30312D] text-[11px] uppercase tracking-wide text-[#8F908A]">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Empleado</th>
                <th className="px-3 py-2.5 font-semibold">Fecha</th>
                <th className="px-3 py-2.5 font-semibold">Entrada</th>
                <th className="px-3 py-2.5 font-semibold">Salida almuerzo</th>
                <th className="px-3 py-2.5 font-semibold">Regreso almuerzo</th>
                <th className="px-3 py-2.5 font-semibold">Salida final</th>
                <th className="px-3 py-2.5 font-semibold">Estado</th>
                <th className="px-3 py-2.5 font-semibold">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#3A3A36] text-[#CFCFCB]">
              {jornadas.map((jornada) => (
                <tr key={jornada.id} className="transition hover:bg-[#2D2E2A]">
                  <td className="px-3 py-2.5">
                    <p className="font-semibold text-[#F5F5F5]">{jornada.empleado}</p>
                    <p className="text-xs text-[#8F908A]">{jornada.correo || jornada.usuarioId}</p>
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="text-[#F5F5F5]">{jornada.fecha}</p>
                    {jornada.horasTrabajadas > 0 ? (
                      <p className="text-xs text-[#A7A7A7]">{formatHours(jornada.horasTrabajadas)} registradas</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{formatTime(jornada.entrada)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{formatTime(jornada.salidaAlmuerzo)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{formatTime(jornada.regresoAlmuerzo)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{formatTime(jornada.salidaFinal)}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses(jornada.estadoDia)}`}>
                      {jornada.estadoDia}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/horarios/admin/jornadas/${jornada.id}`}
                      className="inline-flex rounded-full border border-[#D7FF4F]/30 px-3 py-1.5 text-xs font-semibold text-[#D7FF4F] transition hover:bg-[#D7FF4F] hover:text-[#10110E]"
                    >
                      Revisar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-4 py-8 text-center">
          <p className="text-sm font-medium text-[#CFCFCB]">Sin jornadas pendientes de revisión.</p>
          <p className="mt-1 text-xs text-[#8F908A]">Todas las jornadas están finalizadas o revisadas.</p>
        </div>
      )}
    </section>
  );
}

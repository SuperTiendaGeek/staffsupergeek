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

function statusClasses(status: string) {
  if (status === "Incompleto") {
    return "border-red-300/30 bg-red-300/10 text-red-100";
  }

  if (status === "En almuerzo") {
    return "border-amber-300/30 bg-amber-300/10 text-amber-100";
  }

  return "border-sky-300/30 bg-sky-300/10 text-sky-100";
}

export function HorariosAdminJornadasClient({ jornadas }: Props) {
  return (
    <section className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.035] shadow-2xl shadow-black/20 backdrop-blur">
      <div className="border-b border-white/10 px-4 py-4">
        <h2 className="text-lg font-semibold text-white">Jornadas por revisar</h2>
        <p className="mt-1 text-sm text-zinc-400">Jornadas en estado Trabajando, En almuerzo o Incompleto.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full divide-y divide-white/10 text-left text-sm">
          <thead className="bg-white/[0.04] text-xs uppercase text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-semibold">Empleado</th>
              <th className="px-4 py-3 font-semibold">Fecha</th>
              <th className="px-4 py-3 font-semibold">Entrada</th>
              <th className="px-4 py-3 font-semibold">Salida almuerzo</th>
              <th className="px-4 py-3 font-semibold">Regreso almuerzo</th>
              <th className="px-4 py-3 font-semibold">Salida final</th>
              <th className="px-4 py-3 font-semibold">Estado actual</th>
              <th className="px-4 py-3 font-semibold">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {jornadas.length ? (
              jornadas.map((jornada) => (
                <tr key={jornada.id} className="text-zinc-200">
                  <td className="px-4 py-4">
                    <p className="font-medium text-white">{jornada.empleado}</p>
                    <p className="text-xs text-zinc-500">{jornada.correo || jornada.usuarioId}</p>
                  </td>
                  <td className="px-4 py-4">{jornada.fecha}</td>
                  <td className="px-4 py-4">{formatTime(jornada.entrada)}</td>
                  <td className="px-4 py-4">{formatTime(jornada.salidaAlmuerzo)}</td>
                  <td className="px-4 py-4">{formatTime(jornada.regresoAlmuerzo)}</td>
                  <td className="px-4 py-4">{formatTime(jornada.salidaFinal)}</td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold ${statusClasses(jornada.estadoDia)}`}>
                      {jornada.estadoDia}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <Link href={`/horarios/admin/jornadas/${jornada.id}`} className="font-semibold text-geek-lime transition hover:text-white">
                      Revisar
                    </Link>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-zinc-400">
                  No hay jornadas pendientes de revisión.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

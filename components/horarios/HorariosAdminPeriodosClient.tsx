"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import type { HorarioEmpleadoPeriodoOption, HorarioPeriodoPagoDetalle } from "@/types/horarios";

type Props = {
  periodos: HorarioPeriodoPagoDetalle[];
  empleados: HorarioEmpleadoPeriodoOption[];
};

type ApiResponse = {
  success?: boolean;
  error?: string;
};

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
  if (status === "Pagado") {
    return "border-geek-lime/30 bg-geek-lime/10 text-geek-lime";
  }

  if (status === "Parcialmente pagado") {
    return "border-amber-300/30 bg-amber-300/10 text-amber-100";
  }

  return "border-white/10 bg-white/[0.05] text-zinc-300";
}

export function HorariosAdminPeriodosClient({ periodos, empleados }: Props) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [empleadoId, setEmpleadoId] = useState(empleados[0]?.empleadoRecordId || "");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canCreate = useMemo(() => empleados.length > 0, [empleados.length]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/horarios/admin/periodos", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empleadoId, fechaInicio, fechaFin })
      });
      const payload = (await response.json()) as ApiResponse;

      if (!response.ok || !payload.success) {
        setError(payload.error || "No se pudo crear el periodo");
        return;
      }

      setNotice("Periodo creado correctamente");
      setIsOpen(false);
      setFechaInicio("");
      setFechaFin("");
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-4 shadow-2xl shadow-black/20 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Periodos de pago</h2>
          <p className="mt-1 text-sm text-zinc-400">Crea periodos, revisa saldos y registra pagos por empleado.</p>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          disabled={!canCreate}
          className="rounded-md bg-geek-lime px-4 py-2.5 text-sm font-semibold text-geek-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Crear periodo
        </button>
      </div>

      {notice ? (
        <p className="rounded-md border border-geek-lime/30 bg-geek-lime/10 px-4 py-3 text-sm text-geek-lime">{notice}</p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100">{error}</p>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.035] shadow-2xl shadow-black/20 backdrop-blur">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10 text-left text-sm">
            <thead className="bg-white/[0.04] text-xs uppercase text-zinc-400">
              <tr>
                <th className="px-4 py-3 font-semibold">Empleado</th>
                <th className="px-4 py-3 font-semibold">Periodo</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold">Total horas</th>
                <th className="px-4 py-3 font-semibold">Total neto</th>
                <th className="px-4 py-3 font-semibold">Pagado</th>
                <th className="px-4 py-3 font-semibold">Saldo neto</th>
                <th className="px-4 py-3 font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {periodos.length ? (
                periodos.map((periodo) => (
                  <tr key={periodo.id} className="text-zinc-200">
                    <td className="px-4 py-4">
                      <p className="font-medium text-white">{periodo.empleado}</p>
                      <p className="text-xs text-zinc-500">{periodo.correo || periodo.usuarioId}</p>
                    </td>
                    <td className="px-4 py-4">{periodo.fechaInicio} - {periodo.fechaFin}</td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold ${statusClasses(periodo.estadoPeriodo)}`}>
                        {periodo.estadoPeriodo}
                      </span>
                    </td>
                    <td className="px-4 py-4 font-semibold text-white">{formatHours(periodo.totalHoras)}</td>
                    <td className="px-4 py-4">{formatMoney(periodo.totalNeto)}</td>
                    <td className="px-4 py-4">{formatMoney(periodo.totalPagado)}</td>
                    <td className="px-4 py-4 font-semibold text-geek-lime">{formatMoney(periodo.saldoPendienteNeto)}</td>
                    <td className="px-4 py-4">
                      <Link href={`/horarios/admin/periodos/${periodo.id}`} className="font-semibold text-geek-lime transition hover:text-white">
                        Ver detalle
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-zinc-400">
                    Aún no hay periodos de pago creados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="w-full max-w-lg rounded-lg border border-white/10 bg-geek-black p-5 shadow-2xl shadow-black">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-white">Crear periodo</h3>
                <p className="mt-1 text-sm text-zinc-400">Se vincularán registros finalizados o revisados dentro del rango.</p>
              </div>
              <button type="button" onClick={() => setIsOpen(false)} className="rounded-md border border-white/10 px-3 py-1.5 text-sm text-zinc-300 hover:text-white">
                Cerrar
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-zinc-300">Empleado</span>
                <select
                  value={empleadoId}
                  onChange={(event) => setEmpleadoId(event.target.value)}
                  className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-geek-lime"
                  required
                >
                  {empleados.map((empleado) => (
                    <option key={empleado.empleadoRecordId} value={empleado.empleadoRecordId} className="bg-geek-black">
                      {empleado.empleado} - {empleado.correo}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium text-zinc-300">Fecha inicio</span>
                  <input
                    type="date"
                    value={fechaInicio}
                    onChange={(event) => setFechaInicio(event.target.value)}
                    className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-geek-lime"
                    required
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-zinc-300">Fecha fin</span>
                  <input
                    type="date"
                    value={fechaFin}
                    onChange={(event) => setFechaFin(event.target.value)}
                    className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-geek-lime"
                    required
                  />
                </label>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setIsOpen(false)} className="rounded-md border border-white/10 px-4 py-2.5 text-sm font-medium text-zinc-200 hover:text-white">
                Cancelar
              </button>
              <button type="submit" disabled={isSubmitting} className="rounded-md bg-geek-lime px-4 py-2.5 text-sm font-semibold text-geek-black hover:bg-white disabled:cursor-not-allowed disabled:opacity-50">
                {isSubmitting ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}

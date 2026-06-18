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
  actualizados?: number;
  revisados?: number;
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
    return "border-[#D7FF4F]/30 bg-[#D7FF4F]/10 text-[#D7FF4F]";
  }

  if (status === "Parcialmente pagado") {
    return "border-amber-300/30 bg-amber-300/10 text-amber-100";
  }

  if (status === "Cerrado" || status === "Anulado") {
    return "border-[#3A3A36] bg-[#2D2E2A] text-[#CFCFCB]";
  }

  return "border-[#3A3A36] bg-[#2D2E2A] text-[#A7A7A7]";
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
  const [deleteTarget, setDeleteTarget] = useState<HorarioPeriodoPagoDetalle | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdatingEstados, setIsUpdatingEstados] = useState(false);

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

  async function handleDeletePeriodo() {
    if (!deleteTarget) {
      return;
    }

    setError("");
    setNotice("");
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/horarios/admin/periodos/${deleteTarget.id}`, {
        method: "DELETE",
        credentials: "same-origin"
      });
      const payload = (await response.json()) as ApiResponse;

      if (!response.ok || !payload.success) {
        setError(payload.error || "No se pudo eliminar el periodo");
        return;
      }

      setNotice("Periodo eliminado correctamente. Las jornadas quedaron disponibles sin periodo.");
      setDeleteTarget(null);
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleActualizarEstados() {
    setError("");
    setNotice("");
    setIsUpdatingEstados(true);

    try {
      const response = await fetch("/api/horarios/admin/periodos/actualizar-estados", {
        method: "POST",
        credentials: "same-origin"
      });
      const payload = (await response.json()) as ApiResponse;

      if (!response.ok || !payload.success) {
        setError(payload.error || "No se pudieron actualizar los estados");
        return;
      }

      setNotice(`Estados actualizados: ${payload.actualizados ?? 0} de ${payload.revisados ?? 0} periodos revisados.`);
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setIsUpdatingEstados(false);
    }
  }

  return (
    <section className="space-y-3">
      {/* Header */}
      <div className="flex flex-col gap-3 rounded-[1rem] border border-[#3A3A36] bg-[#252622] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-[#F5F5F5]">Periodos de pago</h2>
          <p className="mt-0.5 text-xs text-[#A7A7A7]">Crea periodos, revisa saldos y registra pagos por empleado.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleActualizarEstados}
            disabled={isUpdatingEstados}
            className="rounded-full border border-[#3A3A36] px-3 py-1.5 text-sm font-semibold text-[#CFCFCB] transition hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isUpdatingEstados ? "Actualizando..." : "Actualizar estados"}
          </button>
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            disabled={!canCreate}
            className="rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-3 py-1.5 text-sm font-semibold text-[#10110E] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Crear periodo
          </button>
        </div>
      </div>

      {/* Banners */}
      {notice ? (
        <p className="rounded-xl border border-[#D7FF4F]/30 bg-[#D7FF4F]/10 px-3 py-2.5 text-sm text-[#D7FF4F]">{notice}</p>
      ) : null}
      {error ? (
        <p className="rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2.5 text-sm text-red-100">{error}</p>
      ) : null}

      {/* Tabla de periodos */}
      <div className="overflow-hidden rounded-[1rem] border border-[#3A3A36] bg-[#252622]">
        {periodos.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-[960px] w-full divide-y divide-[#3A3A36] text-left text-sm">
              <thead className="bg-[#30312D] text-[11px] uppercase tracking-wide text-[#8F908A]">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Empleado</th>
                  <th className="px-3 py-2.5 font-semibold">Periodo</th>
                  <th className="px-3 py-2.5 font-semibold">Estado</th>
                  <th className="px-3 py-2.5 font-semibold">Total horas</th>
                  <th className="px-3 py-2.5 font-semibold">Total neto</th>
                  <th className="px-3 py-2.5 font-semibold">Pagado</th>
                  <th className="px-3 py-2.5 font-semibold">Saldo neto</th>
                  <th className="px-3 py-2.5 font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#3A3A36] text-[#CFCFCB]">
                {periodos.map((periodo) => {
                  const hasSaldo = periodo.saldoPendienteNeto > 0;
                  return (
                    <tr
                      key={periodo.id}
                      className={`transition ${hasSaldo ? "hover:bg-[#D7FF4F]/[0.04]" : "hover:bg-[#2D2E2A]"}`}
                    >
                      <td className="px-3 py-2.5">
                        <p className="font-semibold text-[#F5F5F5]">{periodo.empleado}</p>
                        <p className="text-xs text-[#8F908A]">{periodo.correo || periodo.usuarioId}</p>
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">
                        {periodo.fechaInicio} — {periodo.fechaFin}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses(periodo.estadoPeriodo)}`}>
                          {periodo.estadoPeriodo}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-[#F5F5F5] tabular-nums">{formatHours(periodo.totalHoras)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{formatMoney(periodo.totalNeto)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{formatMoney(periodo.totalPagado)}</td>
                      <td className="px-3 py-2.5 tabular-nums">
                        <span className={`font-semibold ${hasSaldo ? "text-[#D7FF4F]" : "text-[#CFCFCB]"}`}>
                          {formatMoney(periodo.saldoPendienteNeto)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/horarios/admin/periodos/${periodo.id}`}
                            className="inline-flex rounded-full border border-[#D7FF4F]/30 px-3 py-1.5 text-xs font-semibold text-[#D7FF4F] transition hover:bg-[#D7FF4F] hover:text-[#10110E]"
                          >
                            Ver detalle
                          </Link>
                          <button
                            type="button"
                            onClick={() => {
                              setError("");
                              setNotice("");
                              setDeleteTarget(periodo);
                            }}
                            className="inline-flex rounded-full border border-red-400/30 px-3 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-400/20 hover:text-red-200"
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-4 py-8 text-center">
            <p className="text-sm font-medium text-[#CFCFCB]">Aún no hay periodos de pago creados.</p>
            <p className="mt-1 text-xs text-[#8F908A]">Usa el botón "Crear periodo" para agregar el primero.</p>
          </div>
        )}
      </div>

      {/* Modal: Crear periodo */}
      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-3 py-5">
          <form onSubmit={handleSubmit} className="w-full max-w-lg rounded-[1rem] border border-[#3A3A36] bg-[#252622] p-5 shadow-2xl shadow-black">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-lg font-semibold text-[#F5F5F5]">Crear periodo</h3>
                <p className="mt-1 text-sm text-[#A7A7A7]">Se vincularán registros finalizados o revisados dentro del rango.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="shrink-0 rounded-full border border-[#3A3A36] px-3 py-1.5 text-sm text-[#CFCFCB] transition hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F]"
              >
                Cerrar
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-[#CFCFCB]">Empleado</span>
                <select
                  value={empleadoId}
                  onChange={(event) => setEmpleadoId(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2 text-sm text-[#F5F5F5] outline-none transition focus:border-[#D7FF4F]/60"
                  required
                >
                  {empleados.map((empleado) => (
                    <option key={empleado.empleadoRecordId} value={empleado.empleadoRecordId} className="bg-[#1E1F1C]">
                      {empleado.empleado} - {empleado.correo}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium text-[#CFCFCB]">Fecha inicio</span>
                  <input
                    type="date"
                    value={fechaInicio}
                    onChange={(event) => setFechaInicio(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2 text-sm text-[#F5F5F5] outline-none transition focus:border-[#D7FF4F]/60"
                    required
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-[#CFCFCB]">Fecha fin</span>
                  <input
                    type="date"
                    value={fechaFin}
                    onChange={(event) => setFechaFin(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2 text-sm text-[#F5F5F5] outline-none transition focus:border-[#D7FF4F]/60"
                    required
                  />
                </label>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-full border border-[#3A3A36] px-4 py-2 text-sm font-medium text-[#CFCFCB] transition hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-4 py-2 text-sm font-semibold text-[#10110E] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* Modal: Eliminar periodo */}
      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-3 py-5">
          <div className="w-full max-w-md rounded-[1rem] border border-[#3A3A36] bg-[#252622] p-5 shadow-2xl shadow-black">
            <h3 className="text-lg font-semibold text-[#F5F5F5]">Eliminar periodo</h3>
            <p className="mt-3 text-sm leading-6 text-[#CFCFCB]">
              ¿Seguro que deseas eliminar el periodo de{" "}
              <span className="font-semibold text-[#F5F5F5]">{deleteTarget.empleado}</span> del{" "}
              {deleteTarget.fechaInicio} al {deleteTarget.fechaFin}?
            </p>
            <p className="mt-2 text-sm text-[#8F908A]">
              Las jornadas vinculadas no se borrarán; quedarán nuevamente sin periodo asignado.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="rounded-full border border-[#3A3A36] px-4 py-2 text-sm font-medium text-[#CFCFCB] transition hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeletePeriodo}
                disabled={isDeleting}
                className="rounded-full border border-red-400/30 bg-red-400/10 px-4 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-400/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isDeleting ? "Eliminando..." : "Eliminar periodo"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

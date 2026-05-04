"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { HorarioEstado, TipoMarcacion } from "@/types/horarios";

type HorariosClientProps = {
  initialEstado: HorarioEstado | null;
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

function formatTime(value?: string) {
  if (!value) {
    return "--:--";
  }

  return new Intl.DateTimeFormat("es-EC", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
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

export function HorariosClient({ initialEstado, initialError, isAdmin }: HorariosClientProps) {
  const [estado, setEstado] = useState(initialEstado);
  const [error, setError] = useState(initialError || "");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const registro = estado?.registro;
  const estadoDia = registro?.estadoDia || "Pendiente";
  const siguienteMarcacion = estado?.siguienteMarcacion;

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
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="w-full max-w-5xl space-y-5 text-left">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-zinc-400">Fecha operativa</p>
          <p className="text-lg font-semibold text-white">{estado?.fecha || "Hoy"}</p>
        </div>
        <div className="flex gap-2">
          {isAdmin ? (
            <Link
              href="/horarios/admin"
              className="rounded-md border border-white/10 px-4 py-2.5 text-sm font-medium text-zinc-200 transition hover:border-geek-lime/50 hover:text-geek-lime"
            >
              Vista admin
            </Link>
          ) : null}
          <button
            type="button"
            onClick={refreshEstado}
            className="rounded-md border border-white/10 px-4 py-2.5 text-sm font-medium text-zinc-200 transition hover:border-geek-lime/50 hover:text-geek-lime"
          >
            Actualizar
          </button>
        </div>
      </div>

      {notice ? (
        <p className="rounded-md border border-geek-lime/30 bg-geek-lime/10 px-4 py-3 text-sm text-geek-lime" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-lg border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/20 backdrop-blur">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <span className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold ${statusClasses(estadoDia)}`}>
                {estadoDia}
              </span>
              <h2 className="mt-4 text-2xl font-semibold text-white">Control de horario</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-300">
                La hora registrada se toma desde el servidor para proteger la integridad de cada marcación.
              </p>
            </div>
            <div className="rounded-lg border border-geek-lime/20 bg-geek-lime/10 px-4 py-3 text-right">
              <p className="text-xs text-zinc-300">Valor hora</p>
              <p className="text-xl font-semibold text-geek-lime">{formatMoney(estado?.resumen.valorHora || 3.0125)}</p>
            </div>
          </div>

          <button
            type="button"
            disabled={!estado?.puedeMarcar || !siguienteMarcacion || isSubmitting}
            onClick={handleMarcar}
            className="mt-6 w-full rounded-md bg-geek-lime px-5 py-4 text-base font-semibold text-geek-black shadow-glow transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "Registrando..." : estado?.siguienteEtiqueta || "Sin acciones pendientes"}
          </button>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {marcas.map((marca) => (
              <div key={marca.label} className="rounded-lg border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-normal text-zinc-500">{marca.label}</p>
                <p className="mt-2 text-lg font-semibold text-white">{formatTime(marca.value)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-white/10 bg-white/[0.035] p-5 shadow-2xl shadow-black/20 backdrop-blur">
          <h2 className="text-lg font-semibold text-white">Resumen del día</h2>
          <div className="mt-4 space-y-3">
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

      <section className="rounded-lg border border-white/10 bg-white/[0.035] p-5 shadow-2xl shadow-black/20 backdrop-blur">
        <h2 className="text-lg font-semibold text-white">Historial de marcaciones</h2>
        <div className="mt-4 divide-y divide-white/10">
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

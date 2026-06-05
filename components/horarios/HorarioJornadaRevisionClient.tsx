"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import type { CorregirJornadaAdminInput, HorarioRegistro } from "@/types/horarios";

type Props = {
  jornada: HorarioRegistro;
};

type ApiResponse = {
  success?: boolean;
  error?: string;
};

const HORARIOS_TIME_ZONE = "America/Guayaquil";

function toDateTimeLocalValue(value?: string) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: HORARIOS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const getPart = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";

  return `${getPart("year")}-${getPart("month")}-${getPart("day")}T${getPart("hour")}:${getPart("minute")}`;
}

export function HorarioJornadaRevisionClient({ jornada }: Props) {
  const router = useRouter();
  const [entrada, setEntrada] = useState(toDateTimeLocalValue(jornada.entrada));
  const [salidaAlmuerzo, setSalidaAlmuerzo] = useState(toDateTimeLocalValue(jornada.salidaAlmuerzo));
  const [regresoAlmuerzo, setRegresoAlmuerzo] = useState(toDateTimeLocalValue(jornada.regresoAlmuerzo));
  const [salidaFinal, setSalidaFinal] = useState(toDateTimeLocalValue(jornada.salidaFinal));
  const [observaciones, setObservaciones] = useState(jornada.observaciones || "");
  const [estadoDia, setEstadoDia] = useState<CorregirJornadaAdminInput["estadoDia"]>("Revisado");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/horarios/admin/jornadas/${jornada.id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entrada,
          salidaAlmuerzo,
          regresoAlmuerzo,
          salidaFinal,
          observaciones,
          estadoDia
        })
      });
      const payload = (await response.json()) as ApiResponse;

      if (!response.ok || !payload.success) {
        setError(payload.error || "No se pudo corregir la jornada");
        return;
      }

      setNotice("Jornada corregida correctamente");
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-[#30312D] bg-[#171814] px-3 py-2.5 shadow-2xl shadow-black/20 backdrop-blur">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-zinc-300">Entrada</span>
          <input
            type="datetime-local"
            value={entrada}
            onChange={(event) => setEntrada(event.target.value)}
            className="mt-1 w-full rounded-md border border-[#30312D] bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-geek-lime"
            required
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-zinc-300">Salida final</span>
          <input
            type="datetime-local"
            value={salidaFinal}
            onChange={(event) => setSalidaFinal(event.target.value)}
            className="mt-1 w-full rounded-md border border-[#30312D] bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-geek-lime"
            required
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-zinc-300">Salida almuerzo</span>
          <input
            type="datetime-local"
            value={salidaAlmuerzo}
            onChange={(event) => setSalidaAlmuerzo(event.target.value)}
            className="mt-1 w-full rounded-md border border-[#30312D] bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-geek-lime"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-zinc-300">Regreso almuerzo</span>
          <input
            type="datetime-local"
            value={regresoAlmuerzo}
            onChange={(event) => setRegresoAlmuerzo(event.target.value)}
            className="mt-1 w-full rounded-md border border-[#30312D] bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-geek-lime"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-sm font-medium text-zinc-300">Estado del día</span>
          <select
            value={estadoDia}
            onChange={(event) => setEstadoDia(event.target.value as CorregirJornadaAdminInput["estadoDia"])}
            className="mt-1 w-full rounded-md border border-[#30312D] bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-geek-lime"
          >
            <option value="Revisado" className="bg-geek-black">Revisado</option>
            <option value="Finalizado" className="bg-geek-black">Finalizado</option>
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="text-sm font-medium text-zinc-300">Observaciones</span>
          <textarea
            value={observaciones}
            onChange={(event) => setObservaciones(event.target.value)}
            rows={4}
            className="mt-1 w-full rounded-md border border-[#30312D] bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-geek-lime"
          />
        </label>
      </div>

      {notice ? (
        <p className="mt-3 rounded-md border border-geek-lime/30 bg-geek-lime/10 px-3 py-2 text-sm text-geek-lime">{notice}</p>
      ) : null}
      {error ? (
        <p className="mt-3 rounded-md border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-100">{error}</p>
      ) : null}

      <div className="mt-6 flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-geek-lime px-3 py-2 text-sm font-semibold text-geek-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? "Guardando..." : "Guardar corrección"}
        </button>
      </div>
    </form>
  );
}

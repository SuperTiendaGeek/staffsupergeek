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

function inputClasses(value: string, isEmpty: boolean, isRequired: boolean) {
  if (!isEmpty) {
    return "mt-1 h-9 w-full rounded-xl border border-[#D7FF4F]/25 bg-[#1E1F1C] px-3 text-sm text-[#F5F5F5] outline-none transition focus:border-[#D7FF4F]/60";
  }
  if (isRequired) {
    return "mt-1 h-9 w-full rounded-xl border border-amber-400/30 bg-[#1E1F1C] px-3 text-sm text-[#A7A7A7] outline-none transition focus:border-amber-400/60";
  }
  return "mt-1 h-9 w-full rounded-xl border border-[#3A3A36] bg-[#1E1F1C] px-3 text-sm text-[#A7A7A7] outline-none transition focus:border-[#D7FF4F]/40";
}

function FieldBadge({ value, isRequired }: { value: string; isRequired: boolean }) {
  if (value) {
    return <span className="text-[10px] font-semibold uppercase tracking-wide text-[#D7FF4F]/70">Registrada</span>;
  }
  if (isRequired) {
    return <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-400/80">Faltante</span>;
  }
  return <span className="text-[10px] font-semibold uppercase tracking-wide text-[#8F908A]">Opcional</span>;
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
    <form onSubmit={handleSubmit} className="rounded-[1rem] border border-[#3A3A36] bg-[#252622] p-5">
      {/* Header */}
      <div className="border-b border-[#3A3A36] pb-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-[#8F908A]">Formulario de corrección</p>
        <p className="mt-0.5 text-sm text-[#A7A7A7]">Completa o corrige las marcaciones y asigna el estado final antes de guardar.</p>
      </div>

      {/* Marcaciones */}
      <p className="mt-4 text-[11px] font-bold uppercase tracking-wider text-[#8F908A]">Marcaciones</p>
      <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="flex items-center justify-between">
            <span className="text-sm font-medium text-[#CFCFCB]">Entrada</span>
            <FieldBadge value={entrada} isRequired={true} />
          </span>
          <input
            type="datetime-local"
            value={entrada}
            onChange={(event) => setEntrada(event.target.value)}
            className={inputClasses(entrada, entrada === "", true)}
            required
          />
        </label>
        <label className="block">
          <span className="flex items-center justify-between">
            <span className="text-sm font-medium text-[#CFCFCB]">Salida almuerzo</span>
            <FieldBadge value={salidaAlmuerzo} isRequired={false} />
          </span>
          <input
            type="datetime-local"
            value={salidaAlmuerzo}
            onChange={(event) => setSalidaAlmuerzo(event.target.value)}
            className={inputClasses(salidaAlmuerzo, salidaAlmuerzo === "", false)}
          />
        </label>
        <label className="block">
          <span className="flex items-center justify-between">
            <span className="text-sm font-medium text-[#CFCFCB]">Regreso almuerzo</span>
            <FieldBadge value={regresoAlmuerzo} isRequired={false} />
          </span>
          <input
            type="datetime-local"
            value={regresoAlmuerzo}
            onChange={(event) => setRegresoAlmuerzo(event.target.value)}
            className={inputClasses(regresoAlmuerzo, regresoAlmuerzo === "", false)}
          />
        </label>
        <label className="block">
          <span className="flex items-center justify-between">
            <span className="text-sm font-medium text-[#CFCFCB]">Salida final</span>
            <FieldBadge value={salidaFinal} isRequired={true} />
          </span>
          <input
            type="datetime-local"
            value={salidaFinal}
            onChange={(event) => setSalidaFinal(event.target.value)}
            className={inputClasses(salidaFinal, salidaFinal === "", true)}
            required
          />
        </label>
      </div>

      {/* Estado final */}
      <p className="mt-4 text-[11px] font-bold uppercase tracking-wider text-[#8F908A]">Estado final</p>
      <div className="mt-1.5">
        <label className="block">
          <span className="flex items-center justify-between">
            <span className="text-sm font-medium text-[#CFCFCB]">Estado del día</span>
            <span className="text-[10px] text-[#8F908A]">Se guardará con este estado</span>
          </span>
          <select
            value={estadoDia}
            onChange={(event) => setEstadoDia(event.target.value as CorregirJornadaAdminInput["estadoDia"])}
            className="mt-1 h-9 w-full rounded-xl border border-[#3A3A36] bg-[#1E1F1C] px-3 text-sm text-[#F5F5F5] outline-none transition focus:border-[#D7FF4F]/60"
          >
            <option value="Revisado" className="bg-[#1E1F1C]">Revisado</option>
            <option value="Finalizado" className="bg-[#1E1F1C]">Finalizado</option>
          </select>
        </label>
      </div>

      {/* Observaciones */}
      <p className="mt-4 text-[11px] font-bold uppercase tracking-wider text-[#8F908A]">Observaciones</p>
      <div className="mt-1.5">
        <label className="block">
          <span className="text-sm font-medium text-[#CFCFCB]">Notas de corrección</span>
          <textarea
            value={observaciones}
            onChange={(event) => setObservaciones(event.target.value)}
            rows={3}
            placeholder="Describe el motivo de la corrección..."
            className="mt-1 w-full rounded-xl border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2.5 text-sm text-[#F5F5F5] outline-none transition placeholder:text-[#8F908A] focus:border-[#D7FF4F]/60"
          />
        </label>
      </div>

      {/* Mensajes */}
      {notice ? (
        <p className="mt-3 rounded-xl border border-[#D7FF4F]/30 bg-[#D7FF4F]/10 px-3 py-2.5 text-sm font-medium text-[#D7FF4F]">{notice}</p>
      ) : null}
      {error ? (
        <p className="mt-3 rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2.5 text-sm text-red-100">{error}</p>
      ) : null}

      {/* Acción */}
      <div className="mt-5 flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-5 py-2 text-sm font-semibold text-[#10110E] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? "Guardando..." : "Guardar corrección"}
        </button>
      </div>
    </form>
  );
}

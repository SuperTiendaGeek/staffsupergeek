"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type CuentaOpcion = { id: string; nombre: string; permiteTransferirAIds: string[] };

type Props = {
  cuentas: CuentaOpcion[];
};

type ApiResponse = { success?: boolean; error?: string; code?: string };

export function DepositoForm({ cuentas }: Props) {
  const router = useRouter();
  const cajaDefault = cuentas.find((c) => c.nombre === "Caja Registradora")?.id ?? cuentas[0]?.id ?? "";
  const sgIngresosDefault = cuentas.find((c) => c.nombre === "SGINGRESOS")?.id ?? "";

  const [cuentaOrigenId, setCuentaOrigenId] = useState(cajaDefault);
  const [cuentaDestinoId, setCuentaDestinoId] = useState(sgIngresosDefault);
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [observacion, setObservacion] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const origen = cuentas.find((c) => c.id === cuentaOrigenId);
  const destinosPermitidos = origen && origen.permiteTransferirAIds.length > 0 ? cuentas.filter((c) => origen.permiteTransferirAIds.includes(c.id)) : cuentas;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setInfo("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/finanzas/depositos", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cuentaOrigenId, cuentaDestinoId, monto: Number(monto), fecha, observacion: observacion || undefined }),
      });
      const payload = (await response.json()) as ApiResponse;

      if (!response.ok || !payload.success) {
        if (payload.code === "PRE_GO_LIVE") {
          setInfo(payload.error || "El sistema contable todavía no está en vivo.");
        } else {
          setError(payload.error || "No se pudo registrar el depósito");
        }
        return;
      }

      setMonto("");
      setObservacion("");
      router.push("/finanzas");
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-3 rounded-xl border border-[#3A3A36] bg-[#1E1F1C] p-4">
      <label className="block">
        <span className="text-sm font-medium text-[#CFCFCB]">Cuenta Origen</span>
        <select
          value={cuentaOrigenId}
          onChange={(event) => setCuentaOrigenId(event.target.value)}
          className="mt-1 w-full rounded-xl border border-[#3A3A36] bg-[#252622] px-3 py-2.5 text-sm text-[#F5F5F5]"
        >
          {cuentas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-[#CFCFCB]">Cuenta Destino</span>
        <select
          value={cuentaDestinoId}
          onChange={(event) => setCuentaDestinoId(event.target.value)}
          className="mt-1 w-full rounded-xl border border-[#3A3A36] bg-[#252622] px-3 py-2.5 text-sm text-[#F5F5F5]"
        >
          {destinosPermitidos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-[#CFCFCB]">Monto</span>
        <input
          type="number"
          min="0.01"
          step="0.01"
          value={monto}
          onChange={(event) => setMonto(event.target.value)}
          required
          className="mt-1 w-full rounded-xl border border-[#3A3A36] bg-[#252622] px-3 py-2.5 text-sm text-[#F5F5F5]"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-[#CFCFCB]">Fecha</span>
        <input
          type="date"
          value={fecha}
          onChange={(event) => setFecha(event.target.value)}
          required
          className="mt-1 w-full rounded-xl border border-[#3A3A36] bg-[#252622] px-3 py-2.5 text-sm text-[#F5F5F5]"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-[#CFCFCB]">Observación (opcional)</span>
        <textarea
          value={observacion}
          onChange={(event) => setObservacion(event.target.value)}
          rows={3}
          className="mt-1 w-full rounded-xl border border-[#3A3A36] bg-[#252622] px-3 py-2.5 text-sm text-[#F5F5F5]"
        />
      </label>

      {info ? <p className="rounded-xl border border-sky-300/25 bg-sky-300/10 px-3 py-2.5 text-sm text-sky-100">{info}</p> : null}
      {error ? <p className="rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2.5 text-sm text-red-100">{error}</p> : null}

      <button
        type="submit"
        disabled={isSubmitting || !cuentaOrigenId || !cuentaDestinoId || !monto}
        className="w-full rounded-full border border-[#D7FF4F]/35 bg-[#D7FF4F]/10 px-4 py-2.5 text-sm font-semibold text-[#D7FF4F] transition hover:bg-[#D7FF4F]/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? "Registrando..." : "Registrar depósito"}
      </button>
    </form>
  );
}

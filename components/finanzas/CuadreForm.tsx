"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Cuadre } from "@/types/finanzas";

type CuentaOpcion = { id: string; nombre: string };

type Props = {
  cuentas: CuentaOpcion[];
  preGoLive: boolean;
  esAdmin: boolean;
  onDone: () => void;
  onRegistrarTransferencia: (input: { cuentaOrigenId: string; monto: string }) => void;
};

type ApiCuadreResponse = { success?: boolean; error?: string; code?: string; data?: Cuadre };
type ApiAjusteResponse = { success?: boolean; error?: string };
type SaldosResponse = { success?: boolean; data?: { saldosPorCuenta?: Array<{ cuentaId: string; saldo: number }> } };

function formatMonto(valor: number) {
  return valor.toLocaleString("es-EC", { style: "currency", currency: "USD" });
}

export function CuadreForm({ cuentas, preGoLive, esAdmin, onDone, onRegistrarTransferencia }: Props) {
  const router = useRouter();
  const cajaDefault = cuentas.find((c) => c.nombre === "Caja Registradora")?.id ?? cuentas[0]?.id ?? "";

  const [cuentaId, setCuentaId] = useState(cajaDefault);
  const [montoContado, setMontoContado] = useState("");
  const [observacion, setObservacion] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saldosPorCuenta, setSaldosPorCuenta] = useState<Map<string, number> | null>(null);
  const [cuadre, setCuadre] = useState<Cuadre | null>(null);
  const [ajusteRegistrado, setAjusteRegistrado] = useState(false);

  useEffect(() => {
    let cancelado = false;
    fetch("/api/finanzas/saldos", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((payload: SaldosResponse) => {
        if (cancelado || !payload.success || !payload.data?.saldosPorCuenta) return;
        setSaldosPorCuenta(new Map(payload.data.saldosPorCuenta.map((c) => [c.cuentaId, c.saldo])));
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, []);

  const saldoEsperado = cuentaId ? (saldosPorCuenta?.get(cuentaId) ?? null) : null;
  const montoNumero = Number(montoContado) || 0;
  const diferencia = saldoEsperado !== null ? round2(montoNumero - saldoEsperado) : null;
  const requiereObservacion = diferencia !== null && diferencia !== 0;

  async function handleSubmit() {
    setError("");
    setInfo("");
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/finanzas/cuadres", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cuentaId, montoContado: montoNumero, observacion: observacion || undefined }),
      });
      const payload = (await response.json()) as ApiCuadreResponse;
      if (!response.ok || !payload.success) {
        if (payload.code === "PRE_GO_LIVE") setInfo(payload.error || "El sistema contable todavía no está en vivo.");
        else setError(payload.error || "No se pudo registrar el cuadre");
        return;
      }
      setCuadre(payload.data ?? null);
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAjuste() {
    if (!cuadre) return;
    setError("");
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/finanzas/cuadres/${cuadre.id}/ajuste`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = (await response.json()) as ApiAjusteResponse;
      if (!response.ok || !payload.success) {
        setError(payload.error || "No se pudo registrar el ajuste");
        return;
      }
      setAjusteRegistrado(true);
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (cuadre) {
    const toneClass =
      cuadre.estado === "Cuadrado"
        ? "border-[#D7FF4F]/35 bg-[#D7FF4F]/10 text-[#D7FF4F]"
        : "border-orange-300/25 bg-orange-300/10 text-orange-200";
    return (
      <div className="space-y-3">
        <div className={`rounded-xl border px-3 py-2.5 text-sm ${toneClass}`}>
          <p className="font-semibold uppercase tracking-normal">{cuadre.estado}</p>
          <p className="mt-1 text-[13px] opacity-85">
            Esperado {formatMonto(cuadre.saldoEsperado)} · Contado {formatMonto(cuadre.montoContado)} · Diferencia{" "}
            {formatMonto(cuadre.diferencia)}
          </p>
        </div>

        {cuadre.diferencia !== 0 ? (
          ajusteRegistrado ? (
            <p className="rounded-xl border border-[#D7FF4F]/35 bg-[#D7FF4F]/10 px-3 py-2.5 text-sm text-[#D7FF4F]">
              Ajuste registrado — el movimiento financiero ya quedó vinculado a este cuadre.
            </p>
          ) : esAdmin ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleAjuste}
                disabled={isSubmitting}
                className="flex-1 rounded-full border border-[#D7FF4F]/35 bg-[#D7FF4F]/10 px-4 py-2 text-sm font-semibold text-[#D7FF4F] transition hover:bg-[#D7FF4F]/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? "Registrando..." : "Registrar ajuste ahora"}
              </button>
              <button
                type="button"
                onClick={onDone}
                className="flex-1 rounded-full border border-[#3A3A36] px-4 py-2 text-sm font-medium text-[#CFCFCB] transition hover:text-[#F5F5F5]"
              >
                Dejar en revisión
              </button>
            </div>
          ) : (
            <p className="rounded-xl border border-sky-300/25 bg-sky-300/10 px-3 py-2.5 text-sm text-sky-100">
              Diferencia registrada — un administrador debe revisar el ajuste.
            </p>
          )
        ) : null}

        {error ? <p className="rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2.5 text-sm text-red-100">{error}</p> : null}

        <button
          type="button"
          onClick={() => onRegistrarTransferencia({ cuentaOrigenId: cuentaId, monto: String(cuadre.montoContado) })}
          className="w-full rounded-full border border-[#3A3A36] px-4 py-2.5 text-sm font-medium text-[#CFCFCB] transition hover:text-[#F5F5F5]"
        >
          Registrar transferencia de este efectivo
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {preGoLive ? (
        <p className="rounded-xl border border-sky-300/25 bg-sky-300/10 px-3 py-2.5 text-sm text-sky-100">
          El sistema contable todavía no está en vivo: faltan Saldo Inicial y Fecha de Corte en una o más cuentas antes de poder
          cuadrar caja (Fase 20.1 §6, paso 9).
        </p>
      ) : null}

      <label className="block">
        <span className="text-sm font-medium text-[#CFCFCB]">Cuenta</span>
        <select
          value={cuentaId}
          onChange={(event) => setCuentaId(event.target.value)}
          className="mt-1 w-full rounded-xl border border-[#3A3A36] bg-[#252622] px-3 py-2.5 text-sm text-[#F5F5F5]"
        >
          {cuentas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        {saldoEsperado !== null ? <p className="mt-1 text-[13px] text-[#A7A7A7]">Saldo esperado: {formatMonto(saldoEsperado)}</p> : null}
      </label>

      <label className="block">
        <span className="text-sm font-medium text-[#CFCFCB]">Monto contado</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={montoContado}
          onChange={(event) => setMontoContado(event.target.value)}
          className="mt-1 w-full rounded-xl border border-[#3A3A36] bg-[#252622] px-3 py-2.5 text-sm text-[#F5F5F5]"
        />
        {diferencia !== null ? (
          <p className={`mt-1 text-[13px] ${diferencia === 0 ? "text-[#D7FF4F]" : "text-orange-300"}`}>
            Diferencia: {formatMonto(diferencia)}
          </p>
        ) : null}
      </label>

      <label className="block">
        <span className="text-sm font-medium text-[#CFCFCB]">
          Observación {requiereObservacion ? "(obligatoria)" : "(opcional)"}
        </span>
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
        type="button"
        onClick={handleSubmit}
        disabled={isSubmitting || !cuentaId || !montoContado || preGoLive || (requiereObservacion && !observacion.trim())}
        className="w-full rounded-full border border-[#D7FF4F]/35 bg-[#D7FF4F]/10 px-4 py-2.5 text-sm font-semibold text-[#D7FF4F] transition hover:bg-[#D7FF4F]/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? "Registrando..." : "Registrar cuadre"}
      </button>
    </div>
  );
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

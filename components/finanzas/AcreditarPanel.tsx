"use client";

import { useEffect, useState } from "react";
import type { Movimiento } from "@/types/finanzas";

type ApiListResponse = { success?: boolean; data?: Movimiento[]; error?: string };
type ApiAcreditarResponse = { success?: boolean; error?: string; code?: string };

function formatMonto(valor: number) {
  return valor.toLocaleString("es-EC", { style: "currency", currency: "USD" });
}

function FilaPendiente({ movimiento, onAcreditado }: { movimiento: Movimiento; onAcreditado: () => void }) {
  const [expandido, setExpandido] = useState(false);
  const [montoNeto, setMontoNeto] = useState(String(movimiento.monto));
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const neto = Number(montoNeto) || 0;
  const comision = Math.max(0, movimiento.monto - neto);

  async function handleAcreditar() {
    setError("");
    setInfo("");
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/finanzas/movimientos/${movimiento.id}/acreditar`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ montoNeto: neto, fecha }),
      });
      const payload = (await response.json()) as ApiAcreditarResponse;
      if (!response.ok || !payload.success) {
        if (payload.code === "PRE_GO_LIVE") setInfo(payload.error || "El sistema contable todavía no está en vivo.");
        else setError(payload.error || "No se pudo acreditar el movimiento");
        return;
      }
      onAcreditado();
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <li className="rounded-xl border border-[#3A3A36] bg-[#1E1F1C] p-3">
      <button type="button" onClick={() => setExpandido((v) => !v)} className="flex w-full items-center justify-between text-left">
        <span className="text-sm text-[#F5F5F5]">
          {movimiento.movimientoId} — {formatMonto(movimiento.monto)} bruto
        </span>
        <span className="text-xs text-[#8F908A]">{expandido ? "Cerrar" : "Acreditar"}</span>
      </button>

      {expandido ? (
        <div className="mt-3 space-y-2">
          <label className="block">
            <span className="text-sm font-medium text-[#CFCFCB]">Monto neto recibido</span>
            <input
              type="number"
              min="0.01"
              max={movimiento.monto}
              step="0.01"
              value={montoNeto}
              onChange={(event) => setMontoNeto(event.target.value)}
              className="mt-1 w-full rounded-xl border border-[#3A3A36] bg-[#252622] px-3 py-2 text-sm text-[#F5F5F5]"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-[#CFCFCB]">Fecha de acreditación</span>
            <input
              type="date"
              value={fecha}
              onChange={(event) => setFecha(event.target.value)}
              className="mt-1 w-full rounded-xl border border-[#3A3A36] bg-[#252622] px-3 py-2 text-sm text-[#F5F5F5]"
            />
          </label>
          <p className="text-sm text-[#A7A7A7]">
            Comisión calculada: {formatMonto(comision)}
            {comision === 0 ? " — sin comisión, no se crea ningún ajuste adicional" : ""}
          </p>
          {info ? <p className="rounded-xl border border-sky-300/25 bg-sky-300/10 px-3 py-2 text-sm text-sky-100">{info}</p> : null}
          {error ? <p className="rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-100">{error}</p> : null}
          <button
            type="button"
            onClick={handleAcreditar}
            disabled={isSubmitting || !(neto > 0) || neto > movimiento.monto}
            className="w-full rounded-full border border-[#D7FF4F]/35 bg-[#D7FF4F]/10 px-4 py-2 text-sm font-semibold text-[#D7FF4F] transition hover:bg-[#D7FF4F]/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "Acreditando..." : "Confirmar acreditación"}
          </button>
        </div>
      ) : null}
    </li>
  );
}

export function AcreditarPanel() {
  const [pendientes, setPendientes] = useState<Movimiento[] | null>(null);
  const [error, setError] = useState("");

  async function cargar() {
    try {
      const response = await fetch("/api/finanzas/movimientos/pendientes-acreditar", { credentials: "same-origin" });
      const payload = (await response.json()) as ApiListResponse;
      if (!response.ok || !payload.success) {
        setError(payload.error || "No se pudo cargar la lista de pendientes");
        return;
      }
      setPendientes(payload.data ?? []);
    } catch {
      setError("No se pudo conectar con el servidor");
    }
  }

  useEffect(() => {
    void cargar();
  }, []);

  if (error) return <p className="rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2.5 text-sm text-red-100">{error}</p>;
  if (pendientes === null) return <p className="text-sm text-[#A7A7A7]">Cargando pendientes por acreditar…</p>;
  if (pendientes.length === 0) return <p className="text-sm text-[#A7A7A7]">No hay pagos en tránsito pendientes de acreditar.</p>;

  return (
    <ul className="space-y-2">
      {pendientes.map((mov) => (
        <FilaPendiente key={mov.id} movimiento={mov} onAcreditado={() => void cargar()} />
      ))}
    </ul>
  );
}

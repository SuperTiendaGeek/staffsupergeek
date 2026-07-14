"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

type CuentaOpcion = { id: string; nombre: string; permiteTransferirAIds: string[] };

type Props = {
  cuentas: CuentaOpcion[];
  preGoLive: boolean;
  onDone: () => void;
  // Fase 20.4 — precarga sin lógica nueva desde el atajo "Registrar
  // transferencia de este efectivo" del cuadre de caja (§2.6 del diseño).
  valoresIniciales?: { cuentaOrigenId?: string; monto?: string };
};

type ApiResponse = { success?: boolean; error?: string; code?: string };
type SaldosResponse = { success?: boolean; data?: { saldosPorCuenta?: Array<{ cuentaId: string; saldo: number }> } };

function formatMonto(valor: number) {
  return valor.toLocaleString("es-EC", { style: "currency", currency: "USD" });
}

export function DepositoForm({ cuentas, preGoLive, onDone, valoresIniciales }: Props) {
  const router = useRouter();
  const cajaDefault = cuentas.find((c) => c.nombre === "Caja Registradora")?.id ?? cuentas[0]?.id ?? "";
  const sgIngresosDefault = cuentas.find((c) => c.nombre === "SGINGRESOS")?.id ?? "";

  const [cuentaOrigenId, setCuentaOrigenId] = useState(valoresIniciales?.cuentaOrigenId ?? cajaDefault);
  const [cuentaDestinoId, setCuentaDestinoId] = useState(sgIngresosDefault);
  const [monto, setMonto] = useState(valoresIniciales?.monto ?? "");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [observacion, setObservacion] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saldosPorCuenta, setSaldosPorCuenta] = useState<Map<string, number> | null>(null);

  // Fase 20.3 (iteración de UX) — saldo disponible en vivo de la cuenta
  // origen seleccionada, vía el mismo /api/finanzas/saldos que ya usa la
  // pantalla principal. Se consulta al abrir el modal, no en cada
  // keystroke — el saldo no cambia mientras el formulario está abierto.
  useEffect(() => {
    let cancelado = false;
    fetch("/api/finanzas/saldos", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((payload: SaldosResponse) => {
        if (cancelado || !payload.success || !payload.data?.saldosPorCuenta) return;
        setSaldosPorCuenta(new Map(payload.data.saldosPorCuenta.map((c) => [c.cuentaId, c.saldo])));
      })
      .catch(() => {
        /* si falla, simplemente no se muestra el saldo — el servidor sigue validando */
      });
    return () => {
      cancelado = true;
    };
  }, []);

  const origen = cuentas.find((c) => c.id === cuentaOrigenId);
  const destinosPermitidos = origen && origen.permiteTransferirAIds.length > 0 ? cuentas.filter((c) => origen.permiteTransferirAIds.includes(c.id)) : cuentas;
  const saldoOrigen = cuentaOrigenId ? saldosPorCuenta?.get(cuentaOrigenId) ?? null : null;
  const montoNumero = Number(monto) || 0;
  const superaSaldo = !preGoLive && saldoOrigen !== null && montoNumero > saldoOrigen;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/finanzas/depositos", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cuentaOrigenId, cuentaDestinoId, monto: montoNumero, fecha, observacion: observacion || undefined }),
      });
      const payload = (await response.json()) as ApiResponse;

      if (!response.ok || !payload.success) {
        setError(payload.error || "No se pudo registrar la transferencia");
        return;
      }

      onDone();
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {preGoLive ? (
        <p className="rounded-xl border border-sky-300/25 bg-sky-300/10 px-3 py-2.5 text-sm text-sky-100">
          El sistema contable todavía no está en vivo: faltan Saldo Inicial y Fecha de Corte en una o más cuentas antes de poder
          registrar transferencias reales (Fase 20.1 §6, paso 9).
        </p>
      ) : null}

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
        {saldoOrigen !== null ? (
          <p className="mt-1 text-[13px] text-[#A7A7A7]">Saldo disponible: {formatMonto(saldoOrigen)}</p>
        ) : null}
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
        <div className="mt-1 flex gap-2">
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={monto}
            onChange={(event) => setMonto(event.target.value)}
            required
            className="w-full rounded-xl border border-[#3A3A36] bg-[#252622] px-3 py-2.5 text-sm text-[#F5F5F5]"
          />
          <button
            type="button"
            onClick={() => saldoOrigen !== null && setMonto(String(saldoOrigen))}
            disabled={!saldoOrigen || saldoOrigen <= 0}
            className="shrink-0 whitespace-nowrap rounded-xl border border-[#3A3A36] px-3 py-2.5 text-sm font-medium text-[#CFCFCB] transition hover:text-[#F5F5F5] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Usar saldo completo
          </button>
        </div>
        {superaSaldo ? (
          <p className="mt-1 text-[13px] text-orange-300">
            El monto supera el saldo disponible ({formatMonto(saldoOrigen!)}).
          </p>
        ) : null}
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

      {error ? <p className="rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2.5 text-sm text-red-100">{error}</p> : null}

      <button
        type="submit"
        disabled={isSubmitting || !cuentaOrigenId || !cuentaDestinoId || !monto || superaSaldo || preGoLive}
        className="w-full rounded-full border border-[#D7FF4F]/35 bg-[#D7FF4F]/10 px-4 py-2.5 text-sm font-semibold text-[#D7FF4F] transition hover:bg-[#D7FF4F]/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? "Registrando..." : "Registrar transferencia"}
      </button>
    </form>
  );
}

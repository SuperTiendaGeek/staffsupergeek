"use client";

import { useState } from "react";
import { Button } from "@/components/tecnicos/ui";

// Devolver en dinero el saldo a favor que el cliente ya tiene (auditoría ops,
// punto 13C). Solo el administrador. Mismos datos que devolver un sobrante
// desde la orden: de qué cuenta sale, cómo y el número.

export type OpcionesDevolucion = {
  puedeDevolver: boolean;
  cuentasDevolucion: Array<{ id: string; nombre: string }>;
  metodosDevolucion: string[];
};

const dinero = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);

const CAMPO =
  "w-full min-w-0 rounded-md border border-[#3A3A36] bg-[#1A1B18] px-2.5 py-2 text-sm text-[#F5F5F5] outline-none focus:border-[#D7FF4F]/60";

export function DevolverSaldoModal({
  clienteId,
  clienteNombre,
  disponible,
  opciones,
  onCerrar,
  onHecho,
}: {
  clienteId: string;
  clienteNombre: string;
  disponible: number;
  opciones: OpcionesDevolucion;
  onCerrar: () => void;
  onHecho: (mensaje: string) => void;
}) {
  const [monto, setMonto] = useState(disponible.toFixed(2));
  const [cuenta, setCuenta] = useState("");
  const [metodo, setMetodo] = useState("");
  const [referencia, setReferencia] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valor = Math.round(Number(monto) * 100) / 100;
  const montoOk = Number.isFinite(valor) && valor > 0 && valor <= disponible + 0.005;
  const referenciaOk = metodo === "Efectivo" || metodo === "Otro" || referencia.trim().length > 0;
  const listo = montoOk && !!cuenta && !!metodo && referenciaOk && !enviando;

  async function enviar() {
    if (!listo) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/tecnicos/clientes/${encodeURIComponent(clienteId)}/saldo-favor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monto: valor, cuentaOrigenId: cuenta, metodo, transaccionId: referencia.trim() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) throw new Error(j.error || "No se pudo registrar la devolución.");
      const exito = `Se devolvieron ${dinero(valor)} a ${clienteNombre}.`;
      onHecho(j.warning ? `${exito} ${j.warning}` : exito);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar la devolución.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-6 backdrop-blur-sm animate-[sg-velo_160ms_ease-out]">
      <div className="w-full max-w-[440px] overflow-hidden rounded-[var(--sg-radius-lg)] border border-[var(--sg-border)] bg-[var(--sg-card)] shadow-2xl animate-[sg-modal_200ms_ease-out]">
        <div className="flex items-baseline justify-between gap-3 border-b border-[var(--sg-divider)] px-5 py-3.5">
          <h3 className="text-base font-extrabold text-[var(--sg-text-primary)]">Devolver saldo a favor</h3>
          <span className="text-xs text-[#A7A7A7]">Tiene {dinero(disponible)}</span>
        </div>
        <div className="grid gap-2 px-5 py-4">
          <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wider text-[#A7A7A7]">
            Monto
            <input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} className={`${CAMPO} tabular-nums`} disabled={enviando} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <select value={cuenta} onChange={(e) => setCuenta(e.target.value)} aria-label="Cuenta de la que sale el dinero" className={CAMPO} disabled={enviando}>
              <option value="">Sale de…</option>
              {opciones.cuentasDevolucion.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <select value={metodo} onChange={(e) => setMetodo(e.target.value)} aria-label="Cómo se devuelve" className={CAMPO} disabled={enviando}>
              <option value="">Cómo…</option>
              {opciones.metodosDevolucion.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <input
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            placeholder={metodo === "Efectivo" || metodo === "Otro" ? "N° (opcional)" : "N° de transacción"}
            aria-label="Número de transacción"
            className={CAMPO}
            disabled={enviando}
          />
          {!montoOk && monto.trim() !== "" && (
            <p className="text-[11px] text-[var(--sg-warning)]">Entre $0.01 y {dinero(disponible)}.</p>
          )}
          {error && <p className="text-xs text-[var(--sg-danger)] animate-[sg-sacudir_300ms_ease]">{error}</p>}
        </div>
        <div className="flex gap-2 border-t border-[var(--sg-divider)] px-5 py-3.5">
          <Button type="button" variant="secondary" onClick={onCerrar} disabled={enviando} className="flex-1">Cancelar</Button>
          <Button type="button" variant="primary" onClick={enviar} disabled={!listo} className="flex-[2]">
            {enviando ? "Registrando…" : `Devolver ${montoOk ? dinero(valor) : ""}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

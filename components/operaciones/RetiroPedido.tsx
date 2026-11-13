"use client";

import { useCallback, useEffect, useState } from "react";

// Plazos de retiro de un pedido aceptado (auditoría ops, punto 10C-3b;
// maquetas 5a y 5b). Una línea con las fechas; si hay recargo, "Quitar"
// (administrador, con motivo); desde el 4.º mes, "Liberar" (administrador).

type Retiro = {
  plazos: string;
  recargo: number;
  recargoQuitado: string;
  porLiberar: boolean;
  guardadoHasta: string;
  pagado: number;
  esAdmin: boolean;
};

const usd = (n: number) => `$${(Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, "")}`;

/** Saldo a favor: vence a los 6 meses (decisión del punto 13). */
function venceSaldo(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 6);
  return d.toLocaleDateString("es-EC", { day: "numeric", month: "short", year: "numeric" });
}

export function LiberarPedidoModal({ pedidoId, codigo, articulo, pagado, onCerrar, onLiberado }: {
  pedidoId: string;
  codigo: string;
  articulo: string;
  pagado: number;
  onCerrar: () => void;
  onLiberado: () => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const liberar = async () => {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/operaciones/${encodeURIComponent(pedidoId)}/retiro`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "liberar" }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || "No se pudo liberar.");
      onLiberado();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo liberar.");
    } finally {
      setEnviando(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm animate-[sg-velo_160ms_ease-out]" onClick={onCerrar}>
      <div role="dialog" aria-labelledby="liberar-titulo" className="w-full max-w-sm space-y-3 rounded-[1rem] border border-[#3A3A36] bg-[#252622] p-4 shadow-2xl animate-[sg-modal_200ms_ease-out]" onClick={(e) => e.stopPropagation()}>
        <h4 id="liberar-titulo" className="text-sm font-semibold text-white">Liberar {codigo}</h4>
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-sm tabular-nums">
          <dt className="min-w-0 truncate text-[#A0A09A]">{articulo}</dt><dd className="text-right text-[#F0F0EC]">→ stock de la tienda</dd>
          <dt className="text-[#A0A09A]">Pagado {usd(pagado)}</dt><dd className="text-right font-bold text-[#D7FF4F]">→ saldo a favor</dd>
          {pagado > 0.005 && (<><dt className="text-[#A0A09A]">Saldo a favor vence</dt><dd className="text-right text-[#F0F0EC]">{venceSaldo()}</dd></>)}
        </dl>
        {error && <p className="text-xs text-[#FF6B6B] animate-[sg-sacudir_300ms_ease-out]">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onCerrar} className="rounded-lg px-3 py-1.5 text-sm text-[#A7A7A7] hover:text-white">Cancelar</button>
          <button type="button" onClick={() => void liberar()} disabled={enviando}
            className="rounded-lg bg-[#D7FF4F] px-4 py-1.5 text-sm font-bold text-[#1E1F1C] transition hover:brightness-95 disabled:opacity-40">
            {enviando ? "Liberando…" : "Liberar"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function RetiroPedido({ pedidoId, codigo, articulo, recargar = 0, onCambio }: {
  pedidoId: string;
  codigo: string;
  articulo: string;
  recargar?: number;
  onCambio: () => void;
}) {
  const [r, setR] = useState<Retiro | null>(null);
  const [quitando, setQuitando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liberando, setLiberando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/operaciones/${encodeURIComponent(pedidoId)}/retiro`, { cache: "no-store" });
      const j = await res.json();
      if (j.success) setR(j.data as Retiro);
    } catch { /* sin plazos: no se muestra nada */ }
  }, [pedidoId]);
  useEffect(() => { void cargar(); }, [cargar, recargar]);

  if (!r || (!r.plazos && r.recargo <= 0)) return null;

  const quitar = async () => {
    if (!motivo.trim()) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/operaciones/${encodeURIComponent(pedidoId)}/retiro`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "quitar_recargo", motivo }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || "No se pudo quitar.");
      setQuitando(false);
      setMotivo("");
      await cargar();
      onCambio();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo quitar.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-[#3A3A36] bg-[#1E1F1C] p-3 text-xs">
      {r.plazos && <p className="text-[#8A8A80]">{r.plazos}</p>}
      {r.recargo > 0.005 && (
        <div className="flex items-center gap-2">
          <span className="text-[#C0C0BC]">Recargo por no retiro</span>
          <span className="ml-auto font-semibold tabular-nums text-[#FFB547]">{usd(r.recargo)}</span>
          {r.esAdmin && !quitando && (
            <button type="button" onClick={() => setQuitando(true)} className="font-semibold text-[#8A8A80] hover:text-[#F0F0EC]">Quitar</button>
          )}
        </div>
      )}
      {quitando && (
        <div className="flex items-center gap-2 animate-[sg-entrada_180ms_ease-out]">
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo" aria-label="Motivo para quitar el recargo" maxLength={300} autoFocus
            className="h-7 min-w-0 flex-1 rounded-lg border border-[#3A3A36] bg-[#151613] px-2 text-xs text-[#F0F0EC] focus:border-[#D7FF4F]/70 focus:outline-none" />
          <button type="button" onClick={() => void quitar()} disabled={!motivo.trim() || enviando} className="font-semibold text-[#D7FF4F] disabled:opacity-40">Quitar</button>
          <button type="button" onClick={() => { setQuitando(false); setMotivo(""); }} className="text-[#8A8A80] hover:text-[#F0F0EC]">Volver</button>
        </div>
      )}
      {r.porLiberar && (
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[#FF5A4F]/15 px-2 py-0.5 text-[11px] font-semibold text-[#FF7A70]">Pasó el plazo máximo</span>
          {r.esAdmin && (
            <button type="button" onClick={() => setLiberando(true)} className="ml-auto rounded-lg border border-[#3A3A36] px-2.5 py-1 font-semibold text-[#F0F0EC] hover:border-[#6A6A62]">Liberar</button>
          )}
        </div>
      )}
      {error && <p className="text-[#FF6B6B]">{error}</p>}
      {liberando && (
        <LiberarPedidoModal pedidoId={pedidoId} codigo={codigo} articulo={articulo} pagado={r.pagado}
          onCerrar={() => setLiberando(false)} onLiberado={() => { setLiberando(false); onCambio(); }} />
      )}
    </section>
  );
}

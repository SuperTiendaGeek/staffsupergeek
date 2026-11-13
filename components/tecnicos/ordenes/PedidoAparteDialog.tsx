"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ResumenAparte } from "@/lib/pedidos-especiales/pedido-aparte";

// "Pasar a pedido aparte" (auditoría ops, punto 10C-1; maqueta 4a aprobada
// el 12-nov). Compacta: la línea, cómo se reparte lo pagado y cuánto falta
// para entregar la orden. El servidor revisa todo otra vez al confirmar.

type Revision = { error: string | null; resumen: ResumenAparte; descripcion: string; situacion: string };

const mon = (n: number) => `$${(Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, "")}`;

export function PedidoAparteDialog({ ordenId, lineaId, onCerrar, onListo }: {
  ordenId: string;
  lineaId: string;
  onCerrar: () => void;
  /** Después de pasar: recargar la orden (la línea ya no está). */
  onListo: (r: { pedidoId: string; codigo: string }) => void | Promise<void>;
}) {
  const [rev, setRev] = useState<Revision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState<{ pedidoId: string; codigo: string } | null>(null);
  const [barra, setBarra] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/presupuesto/${encodeURIComponent(lineaId)}/pedido-aparte`, { cache: "no-store" });
        const j = await res.json();
        if (!vivo) return;
        if (!res.ok || !j.success) throw new Error(j.error || "No se pudo revisar la línea.");
        setRev(j.data as Revision);
        // La barra se reparte después de pintar: se ve a dónde va el dinero.
        requestAnimationFrame(() => setBarra(true));
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : "No se pudo revisar la línea.");
      }
    })();
    return () => { vivo = false; };
  }, [ordenId, lineaId]);

  const pasar = async () => {
    if (!rev || rev.error || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/presupuesto/${encodeURIComponent(lineaId)}/pedido-aparte`, { method: "POST" });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || "No se pudo pasar a pedido aparte.");
      setHecho({ pedidoId: j.data.pedidoId, codigo: j.data.codigo });
      await onListo({ pedidoId: j.data.pedidoId, codigo: j.data.codigo });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo pasar a pedido aparte.");
    } finally {
      setEnviando(false);
    }
  };

  const r = rev?.resumen;
  const total = r ? r.alPedido + r.quedaEnOrden : 0;
  const pctPedido = r && total > 0 ? (r.alPedido / total) * 100 : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm animate-[sg-velo_160ms_ease-out]" onClick={onCerrar}>
      <div role="dialog" aria-labelledby="pedido-aparte-titulo" className="w-full max-w-sm space-y-3 rounded-[1rem] border border-[#3A3A36] bg-[#252622] p-4 shadow-2xl animate-[sg-modal_200ms_ease-out]" onClick={(e) => e.stopPropagation()}>
        <h4 id="pedido-aparte-titulo" className="text-sm font-semibold text-white">Pasar a pedido aparte</h4>

        {!rev && !error && <p className="text-xs text-[#A7A7A7]">Revisando…</p>}

        {rev && r && (
          <>
            <div className="flex items-baseline gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate font-semibold text-[#F5F5F5]">{rev.descripcion}</span>
              <span className="font-bold tabular-nums text-[#F5F5F5]">{mon(r.precioLinea)}</span>
            </div>

            {rev.error ? (
              <p className="text-xs text-[#FF6B6B]">{rev.error}</p>
            ) : hecho ? (
              <p className="rounded-lg border border-[#56E3A4]/40 bg-[#56E3A4]/10 px-3 py-2 text-sm text-[#56E3A4] animate-[sg-entrada_180ms_ease-out]">
                Listo: <Link href={`/operaciones/${encodeURIComponent(hecho.pedidoId)}`} className="font-bold underline">{hecho.codigo}</Link>
              </p>
            ) : (
              <>
                <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm tabular-nums">
                  <dt className="text-[#A7A7A7]">Pagado</dt><dd className="text-right text-[#F5F5F5]">{mon(r.pagado)}</dd>
                  <dt className="text-[#A7A7A7]">→ Pedido nuevo</dt><dd className="text-right font-bold text-[#D7FF4F]">{mon(r.alPedido)}</dd>
                  <dt className="text-[#A7A7A7]">→ Queda en la orden</dt><dd className="text-right font-bold text-[#56E3A4]">{mon(r.quedaEnOrden)}</dd>
                </dl>
                {total > 0 && (
                  <div className="flex h-1.5 overflow-hidden rounded-full bg-[#3A3A36]" aria-hidden="true">
                    <div className="bg-[#D7FF4F] transition-[width] duration-500 ease-out" style={{ width: barra ? `${pctPedido}%` : "0%" }} />
                    <div className="bg-[#56E3A4] transition-[width] duration-500 ease-out" style={{ width: barra ? `${100 - pctPedido}%` : "0%" }} />
                  </div>
                )}
                <div className="space-y-0.5 border-t border-[#3A3A36] pt-2 text-sm tabular-nums">
                  <div className="flex justify-between">
                    <span className="text-[#A7A7A7]">Para entregar la orden</span>
                    <span className={`font-bold ${r.faltaOrden > 0 ? "text-[#FFB547]" : "text-[#56E3A4]"}`}>{r.faltaOrden > 0 ? `cobrar ${mon(r.faltaOrden)}` : "pagada"}</span>
                  </div>
                  {r.faltaPedido > 0 && (
                    <div className="flex justify-between" title="Se cobra al retirar el pedido">
                      <span className="text-[#A7A7A7]">Falta en el pedido</span>
                      <span className="font-semibold text-[#FFB547]">{mon(r.faltaPedido)}</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {error && <p className="text-xs text-[#FF6B6B] animate-[sg-sacudir_300ms_ease-out]">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onCerrar} className="rounded-lg px-3 py-1.5 text-sm text-[#A7A7A7] hover:text-white">{hecho ? "Cerrar" : "Cancelar"}</button>
          {!hecho && (
            <button type="button" onClick={() => void pasar()} disabled={!rev || !!rev.error || enviando}
              className="rounded-lg bg-[#D7FF4F] px-4 py-1.5 text-sm font-bold text-[#1E1F1C] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40">
              {enviando ? "Pasando…" : "Pasar"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

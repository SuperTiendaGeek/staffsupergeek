"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { RevisionPedido } from "@/lib/pedidos-especiales/entrega";

// Entregar un pedido especial (auditoría ops, punto 10C-2; maqueta 4b
// aprobada el 12-nov). Mismo patrón que "Entregar al cliente" de la orden:
// el servidor revisa (GET) y vuelve a revisar al entregar (POST). Compacto:
// cada revisión con su acción al lado; el motivo de lo apagado va en el tooltip.

type Revision = {
  codigo: string;
  saldo: number;
  revisiones: RevisionPedido[];
  faltas: string[];
  sugerido: { retiradoPor: string };
};

const INPUT = "w-full rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-2.5 py-1.5 text-sm text-[#F5F5F5] placeholder:text-[#A7A7A7]/50 focus:border-[#D7FF4F]/70 focus:outline-none";
const ACCION = "shrink-0 rounded-full border border-[#D7FF4F]/40 px-2.5 py-0.5 text-[11px] font-semibold text-[#D7FF4F] transition hover:bg-[#D7FF4F]/10";
const APAGADA = "shrink-0 cursor-not-allowed rounded-full border border-[#3A3A36] px-2.5 py-0.5 text-[11px] font-semibold text-[#6B6B66]";

export function EntregarPedidoPanel({ pedidoId, onCerrar, onEntregado, onRegistrarPago }: {
  pedidoId: string;
  onCerrar: () => void;
  onEntregado: () => void;
  /** Abre "Registrar abono" con lo que falta. */
  onRegistrarPago: (monto: number) => void;
}) {
  const [rev, setRev] = useState<Revision | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [retira, setRetira] = useState("");
  const [obs, setObs] = useState("");

  const revisar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/operaciones/${encodeURIComponent(pedidoId)}/entregar`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || "No se pudo revisar el pedido.");
      const r = j.data as Revision;
      setRev(r);
      setRetira((v) => v || r.sugerido.retiradoPor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo revisar el pedido.");
    } finally {
      setCargando(false);
    }
  }, [pedidoId]);

  useEffect(() => { void revisar(); }, [revisar]);

  const llego = rev?.revisiones.find((r) => r.clave === "llego")?.ok ?? false;
  const cobrado = rev?.revisiones.find((r) => r.clave === "cobro")?.ok ?? false;
  // Sin datos del formulario, las faltas del servidor son las revisiones y el estado del pedido.
  const puede = !!rev && rev.faltas.length === 0 && retira.trim().length > 0;
  const faltaTexto = !rev ? "" : !llego ? "Aún no llega" : [
    ...(cobrado ? [] : ["cobro"]),
    ...(rev.revisiones.find((r) => r.clave === "documento")?.ok ? [] : ["documento"]),
    ...(retira.trim() ? [] : ["quién retira"]),
  ].join(", ");

  const entregar = async () => {
    if (!puede || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/operaciones/${encodeURIComponent(pedidoId)}/entregar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retiradoPor: retira, observacion: obs }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) {
        // Algo cambió desde que se abrió el panel: se vuelve a revisar.
        setError(j.error || "No se pudo entregar.");
        void revisar();
        return;
      }
      onEntregado();
    } catch {
      setError("Error de red. Intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  };

  const accionDe = (r: RevisionPedido) => {
    if (r.ok || !rev) return null;
    if (r.clave === "cobro") {
      return rev.saldo > 0.01
        ? <button type="button" className={ACCION} onClick={() => onRegistrarPago(rev.saldo)}>Registrar pago</button>
        : null;
    }
    if (r.clave === "documento") {
      const motivo = !llego ? "Se factura al llegar: la garantía cuenta desde la factura" : !cobrado ? "Primero cobra lo que falta" : "";
      return motivo
        ? <span className={APAGADA} title={motivo} aria-disabled="true">Emitir</span>
        : <Link className={ACCION} href={`/facturacion/nueva?origen=operacion&recordId=${encodeURIComponent(pedidoId)}`}>Emitir</Link>;
    }
    return null;
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm animate-[sg-velo_160ms_ease-out]" onClick={onCerrar}>
      <div role="dialog" aria-labelledby="entregar-pedido-titulo" className="w-full max-w-sm space-y-3 rounded-[1rem] border border-[#3A3A36] bg-[#252622] p-4 shadow-2xl animate-[sg-modal_200ms_ease-out]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h4 id="entregar-pedido-titulo" className="text-sm font-semibold text-white">Entregar al cliente</h4>
          <button type="button" onClick={() => void revisar()} disabled={cargando} className="text-[11px] text-[#A7A7A7] hover:text-[#D7FF4F] disabled:opacity-50">
            {cargando ? "Revisando…" : "Volver a revisar"}
          </button>
        </div>

        {rev && (
          <ul className="space-y-2">
            {rev.revisiones.map((r) => (
              <li key={`${r.clave}-${r.ok}`} className={`flex items-center gap-2 rounded px-1 text-sm ${r.ok ? "animate-[sg-destello_600ms_ease-out]" : ""}`}>
                <span aria-hidden="true" className={`inline-block h-3 w-3 shrink-0 rounded-full ${r.ok ? "bg-[#56E3A4]" : r.clave === "llego" ? "bg-[#FF6B6B]" : "border-2 border-[#FFB547]"}`} />
                <span className="sr-only">{r.ok ? "Listo:" : "Falta:"}</span>
                <span className={`min-w-0 flex-1 ${r.ok ? "text-[#CFCFCB]" : "font-semibold text-[#F5F5F5]"}`}>{r.texto}</span>
                {accionDe(r)}
              </li>
            ))}
          </ul>
        )}

        {rev && (
          <div className="space-y-2 border-t border-[#3A3A36] pt-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-[#A7A7A7]">Retira</span>
              <input className={INPUT} value={retira} onChange={(e) => setRetira(e.target.value)} maxLength={120} />
            </label>
            <details>
              <summary className="cursor-pointer text-xs font-semibold text-[#A7A7A7]">+ Observación</summary>
              <input className={`${INPUT} mt-1.5`} value={obs} onChange={(e) => setObs(e.target.value)} maxLength={200} aria-label="Observación" />
            </details>
          </div>
        )}

        {error && <p className="text-xs text-[#FF6B6B] animate-[sg-sacudir_300ms_ease-out]">{error}</p>}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={onCerrar} className="rounded-lg px-3 py-1.5 text-sm text-[#A7A7A7] hover:text-white">Cerrar</button>
          <button type="button" onClick={() => void entregar()} disabled={!puede || enviando || cargando} title={puede ? "" : faltaTexto ? `Falta: ${faltaTexto}` : ""}
            className="rounded-lg bg-[#D7FF4F] px-4 py-1.5 text-sm font-bold text-[#1E1F1C] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40">
            {enviando ? "Entregando…" : "Entregar"}
          </button>
        </div>
      </div>
    </div>
  );
}

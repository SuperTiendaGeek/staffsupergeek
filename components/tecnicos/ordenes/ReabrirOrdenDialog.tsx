"use client";

import { useEffect, useState } from "react";
import { MOTIVO_REAPERTURA_MIN } from "@/lib/tecnicos/regreso/reglas";

// Reabrir una orden cerrada (rediseño R6): solo administradores, con motivo.
// Es para corregir un error; si el equipo volvió, se usa «Regresó el equipo».

const DESTINOS = ["Pendiente", "En Proceso", "Esperando Respuesta", "Completado"] as const;

export function ReabrirOrdenDialog({ ordenId, codigo, onCerrar, onReabierta }: {
  ordenId: string;
  codigo: string;
  onCerrar: () => void;
  onReabierta: () => void | Promise<void>;
}) {
  const [destino, setDestino] = useState<(typeof DESTINOS)[number]>("En Proceso");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sacudir, setSacudir] = useState(0);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape" && !enviando) onCerrar(); };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [enviando, onCerrar]);

  const reabrir = async () => {
    if (enviando) return;
    if (motivo.trim().length < MOTIVO_REAPERTURA_MIN) {
      setError(`Escribe por qué se reabre (mínimo ${MOTIVO_REAPERTURA_MIN} letras).`);
      setSacudir((n) => n + 1);
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/estado`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: destino, motivo: motivo.trim() }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || "No se pudo reabrir la orden.");
      await onReabierta();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo reabrir la orden.");
      setSacudir((n) => n + 1);
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm animate-[sg-velo_160ms_ease-out]" onClick={() => !enviando && onCerrar()}>
      <div role="dialog" aria-modal="true" aria-labelledby="reabrir-titulo" className="w-full max-w-md space-y-3 rounded-[1rem] border border-[#3A3A36] bg-[#252622] p-4 shadow-2xl animate-[sg-modal_200ms_ease-out]" onClick={(e) => e.stopPropagation()}>
        <h4 id="reabrir-titulo" className="text-sm font-semibold text-white">Reabrir {codigo}</h4>
        <div role="radiogroup" aria-label="Pasa a" className="inline-flex max-w-full overflow-hidden rounded-lg border border-[#3A3A36]">
          {DESTINOS.map((d, i) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={destino === d}
              onClick={() => setDestino(d)}
              className={`h-8 whitespace-nowrap px-2.5 text-xs font-bold transition-colors duration-150 ${i > 0 ? "border-l border-[#3A3A36]" : ""} ${destino === d ? "bg-[rgba(215,255,79,.12)] text-[#D7FF4F]" : "bg-[#1E1F1C] text-[#B5B5AE] hover:text-white"}`}
            >
              {d}
            </button>
          ))}
        </div>
        <input
          value={motivo}
          onChange={(e) => { setMotivo(e.target.value); setError(null); }}
          placeholder="Motivo (queda en la Actividad)"
          aria-label="Motivo de la reapertura"
          className="h-9 w-full rounded-lg border border-[#3A3A36] bg-[#151613] px-2.5 text-sm text-[#F0F0EC] outline-none transition focus:border-[#D7FF4F]"
        />
        {error && <p key={sacudir} role="alert" className="text-xs text-[#FF7A70] animate-[sg-sacudir_240ms_ease-out]">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCerrar} disabled={enviando} className="h-8 rounded-lg border border-[#3A3A36] px-3 text-xs font-semibold text-[#F0F0EC] transition hover:border-[#5A5A55]">Cancelar</button>
          <button type="button" onClick={reabrir} disabled={enviando} className="h-8 rounded-lg border border-[#FF7A70]/60 bg-[rgba(255,122,112,.12)] px-3 text-xs font-bold text-[#FF9C94] transition hover:bg-[rgba(255,122,112,.2)] disabled:opacity-50">
            {enviando ? "Reabriendo…" : "Reabrir"}
          </button>
        </div>
      </div>
    </div>
  );
}

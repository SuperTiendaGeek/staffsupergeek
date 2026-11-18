"use client";

// Maqueta 12b (aprobada 18-nov-2026): en "Registrar pago" con DeUna, el
// empleado ELIGE el pago que ya llegó (DeUna nos avisa de cada pago) en vez de
// escribir el número a mano: el N.º de transferencia y el monto se llenan
// solos. Así el mismo pago no entra dos veces ni queda colgado en la bandeja
// (la bandeja lo reconoce por el N.º de transferencia y lo enlaza sola).

import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { fechaHoraEcuador } from "@/lib/pagos-en-linea/bandeja";

type Reciente = { codigo: string; monto: number; pagador: string; cedula: string; referencia: string; pagadoEn: string };

const usd = (n: number) => `$${(Math.round(n * 100) / 100).toFixed(2)}`;

export function ElegirPagoDeUna({ referencia, onElegir }: {
  /** N.º de transacción escrito en el formulario (para marcar el elegido). */
  referencia: string;
  onElegir: (pago: { referencia: string; monto: number }) => void;
}) {
  const [lista, setLista] = useState<Reciente[] | null>(null);
  const [error, setError] = useState("");
  const [vuelta, setVuelta] = useState(0);
  // Técnicos no usan la bandeja: sin permiso, no se muestra nada (escriben el número a mano).
  const [sinPermiso, setSinPermiso] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch("/api/pagos-recibidos/deuna-recientes", { cache: "no-store" });
        const j = (await r.json()) as { success: boolean; data?: Reciente[]; error?: string };
        if (!vivo) return;
        if (r.status === 403) { setSinPermiso(true); return; }
        if (j.success && j.data) { setLista(j.data); setError(""); } else { setLista([]); setError(j.error ?? ""); }
      } catch { if (vivo) { setLista([]); setError("Sin conexión."); } }
    })();
    return () => { vivo = false; };
  }, [vuelta]);

  // Mientras espera, se vuelve a consultar cada 10 s (el aviso de DeUna tarda segundos).
  useEffect(() => {
    if (sinPermiso) return;
    const t = setInterval(() => setVuelta((n) => n + 1), 10_000);
    return () => clearInterval(t);
  }, [sinPermiso]);

  if (sinPermiso) return null;

  return (
    <div className="space-y-1.5 rounded-lg border border-[#3A3A36] bg-[#171814] p-2.5">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-[20px] items-center rounded-full bg-[#8DB8FF]/[0.13] px-2 text-[11px] font-semibold text-[#8DB8FF]">DeUna</span>
        <b className="text-xs text-[#F0F0EC]">Elige el pago que recibiste</b>
        <button type="button" aria-label="Actualizar" onClick={() => setVuelta((n) => n + 1)} className="ml-auto text-[#B5B5AE]"><RefreshCw size={12} /></button>
      </div>
      <p className="text-[11px] text-[#B5B5AE]">Pagos DeUna de las últimas 2 horas que todavía no están asignados.</p>
      {lista === null && <p className="flex items-center gap-1.5 text-[11px] text-[#B5B5AE]"><Loader2 size={12} className="animate-spin motion-reduce:animate-none" aria-hidden /> Buscando pagos…</p>}
      {lista && lista.length === 0 && (
        <p className="text-[11px] text-[#B5B5AE]">{error || "Todavía no aparece ninguno: espera unos segundos o escribe el número a mano."}</p>
      )}
      {lista?.map((p) => {
        const on = !!referencia && referencia.trim() === p.referencia;
        return (
          <button key={p.codigo} type="button" aria-pressed={on} onClick={() => onElegir({ referencia: p.referencia, monto: p.monto })}
            className={`grid w-full grid-cols-[14px_1fr_auto] items-center gap-x-2.5 gap-y-0.5 rounded-lg border px-2.5 py-2 text-left text-xs ${on ? "border-[#56E3A4] bg-[#56E3A4]/[0.07]" : "border-[#3A3A36] bg-[#1E1F1C]"}`}>
            <span className={`h-3.5 w-3.5 rounded-full border-2 ${on ? "border-[#56E3A4] bg-[radial-gradient(#56E3A4_40%,transparent_45%)]" : "border-[#6A6A62]"}`} aria-hidden />
            <b className="text-[#F0F0EC]">{p.pagador || "Cliente DeUna"} · {fechaHoraEcuador(p.pagadoEn).slice(11)}</b>
            <b className="tabular-nums text-[#F0F0EC]">{usd(p.monto)}</b>
            <span />
            <span className="tabular-nums text-[#B5B5AE]">{[p.cedula ? `cédula ${p.cedula}` : "", `transferencia ${p.referencia}`].filter(Boolean).join(" · ")}</span>
            <span />
          </button>
        );
      })}
      <p className="text-[11px] text-[#B5B5AE]">El número de transferencia se llena solo. Así un mismo pago no se puede registrar dos veces.</p>
    </div>
  );
}

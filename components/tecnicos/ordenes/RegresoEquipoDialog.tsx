"use client";

import { useEffect, useState } from "react";
import { TIPOS_REGRESO, type TipoRegreso } from "@/lib/tecnicos/regreso/reglas";

// «Regresó el equipo» (rediseño R6, tablero 6 aprobado el 22-nov): la orden
// entregada no se reabre; se crea una orden nueva enlazada con el mismo
// cliente y equipo. Compacto: por qué regresa, qué falló (si es garantía) y el
// motivo de ingreso. El servidor revisa todo otra vez al crear.

type QueFallo = { clave: string; nombre: string; tipo: string; documento: string; vence: string | null; vigente: boolean };
type Datos = { codigo: string; estado: string; equipo: string; cliente: string; queFallo: QueFallo[] };

const fecha = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("es-EC", { day: "numeric", month: "short", year: "numeric" });
};

export function RegresoEquipoDialog({ ordenId, onCerrar, onCreada }: {
  ordenId: string;
  onCerrar: () => void;
  onCreada: (r: { ordenId: string; codigo: string }) => void;
}) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [tipo, setTipo] = useState<TipoRegreso | "">("");
  const [clave, setClave] = useState<string>("");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sacudir, setSacudir] = useState(0);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/regreso`, { cache: "no-store" });
        const j = await res.json();
        if (!vivo) return;
        if (!res.ok || !j.success) throw new Error(j.error || "No se pudo preparar el regreso.");
        setDatos(j.data as Datos);
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : "No se pudo preparar el regreso.");
      }
    })();
    return () => { vivo = false; };
  }, [ordenId]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape" && !enviando) onCerrar(); };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [enviando, onCerrar]);

  const fallar = (texto: string) => { setError(texto); setSacudir((n) => n + 1); };

  const crear = async () => {
    if (enviando) return;
    if (!tipo) return fallar("Elige por qué regresa.");
    if (motivo.trim().length < 5) return fallar("Escribe el motivo de ingreso.");
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/regreso`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, motivo: motivo.trim(), queFalloClave: tipo === "Garantía" && clave ? clave : null }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || "No se pudo crear la orden.");
      onCreada({ ordenId: j.data.ordenId, codigo: j.data.codigo });
    } catch (e) {
      fallar(e instanceof Error ? e.message : "No se pudo crear la orden.");
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm animate-[sg-velo_160ms_ease-out]" onClick={() => !enviando && onCerrar()}>
      <div role="dialog" aria-modal="true" aria-labelledby="regreso-titulo" className="w-full max-w-md space-y-3 rounded-[1rem] border border-[#3A3A36] bg-[#252622] p-4 shadow-2xl animate-[sg-modal_200ms_ease-out]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h4 id="regreso-titulo" className="text-sm font-semibold text-white">Regresó el equipo</h4>
            {datos && <p className="truncate text-xs text-[#B5B5AE]">{[datos.equipo, datos.cliente].filter(Boolean).join(" · ")}</p>}
          </div>
          <button type="button" onClick={onCerrar} disabled={enviando} aria-label="Cerrar" className="grid h-7 w-7 place-items-center rounded-lg border border-[#3A3A36] text-[#B5B5AE] transition hover:text-white">✕</button>
        </div>

        {!datos && !error && <p className="text-xs text-[#A7A7A7]">Cargando…</p>}

        {datos && (
          <>
            <div role="radiogroup" aria-label="Por qué regresa" className="inline-flex overflow-hidden rounded-lg border border-[#3A3A36]">
              {TIPOS_REGRESO.map((t, i) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={tipo === t}
                  title={t === "Garantía" ? "Falla de lo que hicimos: garantía o novedad" : undefined}
                  onClick={() => { setTipo(t); setError(null); }}
                  className={`h-8 px-3.5 text-xs font-bold transition-colors duration-150 ${i > 0 ? "border-l border-[#3A3A36]" : ""} ${tipo === t ? "bg-[rgba(215,255,79,.12)] text-[#D7FF4F]" : "bg-[#1E1F1C] text-[#B5B5AE] hover:text-white"}`}
                >
                  {t}
                </button>
              ))}
            </div>

            {tipo === "Garantía" && (
              <div className="space-y-1.5 animate-[sg-entrada_160ms_ease-out]">
                <p className="text-[11px] font-semibold text-[#B5B5AE]">¿Qué falló?</p>
                {datos.queFallo.length === 0 && <p className="text-xs text-[#B5B5AE]">Esta orden no tiene compras con garantía.</p>}
                {datos.queFallo.map((g) => (
                  <label key={g.clave} className="flex cursor-pointer items-center gap-2 text-sm text-[#F0F0EC]">
                    <input type="radio" name="que-fallo" checked={clave === g.clave} onChange={() => setClave(g.clave)} className="accent-[#D7FF4F]" />
                    <span className="min-w-0 flex-1 truncate">{g.nombre}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${g.vigente ? "bg-[rgba(86,227,164,.13)] text-[#56E3A4]" : "bg-[#2C2D29] text-[#D6D6D0]"}`}>
                      {g.vigente ? `Garantía hasta ${fecha(g.vence)}` : "Vencida"}
                    </span>
                  </label>
                ))}
              </div>
            )}

            <label className="block space-y-1.5">
              <span className="text-[11px] font-semibold text-[#B5B5AE]">Motivo de ingreso</span>
              <textarea
                rows={2}
                value={motivo}
                onChange={(e) => { setMotivo(e.target.value); setError(null); }}
                placeholder="Lo que dice el cliente"
                className="w-full resize-none rounded-lg border border-[#3A3A36] bg-[#151613] px-2.5 py-2 text-sm text-[#F0F0EC] outline-none transition focus:border-[#D7FF4F]"
              />
            </label>
          </>
        )}

        {error && <p key={sacudir} role="alert" className="text-xs text-[#FF7A70] animate-[sg-sacudir_240ms_ease-out]">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCerrar} disabled={enviando} className="h-8 rounded-lg border border-[#3A3A36] px-3 text-xs font-semibold text-[#F0F0EC] transition hover:border-[#5A5A55]">Cancelar</button>
          <button type="button" onClick={crear} disabled={!datos || enviando} className="h-8 rounded-lg bg-[#D7FF4F] px-3 text-xs font-bold text-[#151613] transition hover:brightness-95 disabled:opacity-50">
            {enviando ? "Creando…" : "Crear orden enlazada"}
          </button>
        </div>
      </div>
    </div>
  );
}

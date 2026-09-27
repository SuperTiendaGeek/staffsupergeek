"use client";

import { useState } from "react";
import type { AlertaGeneral } from "@/lib/tecnicos/carteles/reglas";

// Avisos que el cliente acepta una sola vez por orden (retiro del equipo, etc.).
// Se editan aquí; el texto no vive en el código.

const CARD = "rounded-[1rem] border border-[#3A3A36] bg-[#252622] p-4 shadow-xl shadow-black/20 sm:p-5";
const INPUT = "w-full rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2 text-sm text-[#F5F5F5] outline-none transition placeholder:text-[#A7A7A7]/50 focus:border-[#D7FF4F]/70";
const BTN = "inline-flex h-9 items-center justify-center rounded-full px-4 text-sm font-bold transition";
const BTN_PRI = `${BTN} border border-[#D7FF4F] bg-[#D7FF4F] text-[#10110E] hover:brightness-105`;
const BTN_SEC = `${BTN} border border-[#3A3A36] text-[#C9C9C4] hover:border-[#D7FF4F]/60 hover:text-[#F5F5F5]`;

// ─── Avisos de toda la orden ─────────────────────────────────────────────────

export function AvisosGeneralesClient({ alertas: iniciales }: { alertas: AlertaGeneral[] }) {
  const [alertas, onCambio] = useState<AlertaGeneral[]>(iniciales);
  return <Avisos alertas={alertas} onCambio={onCambio} />;
}

function Avisos({ alertas, onCambio }: { alertas: AlertaGeneral[]; onCambio: (a: AlertaGeneral[]) => void }) {
  const vacio: AlertaGeneral = { id: "", titulo: "", contenido: "", textoCasilla: "", activa: true, orden: alertas.length + 1 };
  const [edit, setEdit] = useState<AlertaGeneral | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    if (!edit) return;
    setGuardando(true); setError(null);
    try {
      const r = await fetch("/api/tecnicos/alertas-generales", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(edit),
      });
      const j = await r.json();
      if (!j.success) { setError(j.error ?? "No se pudo guardar"); return; }
      const a = j.data as AlertaGeneral;
      onCambio(alertas.some((x) => x.id === a.id) ? alertas.map((x) => (x.id === a.id ? a : x)) : [...alertas, a]);
      setEdit(null);
    } catch { setError("Error de red"); }
    finally { setGuardando(false); }
  }

  async function borrar(id: string) {
    setGuardando(true); setError(null);
    try {
      const r = await fetch(`/api/tecnicos/alertas-generales?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const j = await r.json();
      if (!j.success) { setError(j.error ?? "No se pudo borrar"); return; }
      onCambio(alertas.filter((x) => x.id !== id));
      setEdit(null);
    } catch { setError("Error de red"); }
    finally { setGuardando(false); }
  }

  return (
    <section className={CARD}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-black text-[#F5F5F5]">Avisos de toda la orden</h2>
          <p className="mt-0.5 max-w-2xl text-xs text-[#A7A7A7]">
            Se muestran una sola vez, al final del enlace, con una casilla que el cliente debe marcar para enviar su
            respuesta (por ejemplo, el retiro del equipo a los 3 meses).
          </p>
        </div>
        <button type="button" onClick={() => setEdit(vacio)} className={BTN_SEC}>+ Nuevo aviso</button>
      </div>

      <ul className="mt-3 space-y-2">
        {alertas.map((a) => (
          <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#F5F5F5]">
                {a.titulo} {a.activa
                  ? <span className="ml-1 rounded-full border border-emerald-300/40 bg-emerald-300/10 px-2 py-0.5 text-[10px] font-bold text-emerald-200">Activo</span>
                  : <span className="ml-1 rounded-full border border-[#3A3A36] px-2 py-0.5 text-[10px] font-bold text-[#8A8A80]">Inactivo</span>}
              </p>
              <p className="mt-0.5 line-clamp-2 text-xs text-[#A7A7A7]">{a.contenido}</p>
            </div>
            <button type="button" onClick={() => setEdit(a)} className={BTN_SEC}>Editar</button>
          </li>
        ))}
        {alertas.length === 0 && <li className="rounded-lg border border-dashed border-[#3A3A36] px-3 py-3 text-xs text-[#A7A7A7]">Todavía no hay avisos generales.</li>}
      </ul>

      {edit && (
        <div className="mt-3 space-y-2.5 rounded-lg border border-[#D7FF4F]/30 bg-[#1E1F1C] p-3">
          <label className="block">
            <span className="text-[11px] text-[#A7A7A7]">Título</span>
            <input value={edit.titulo} onChange={(e) => setEdit({ ...edit, titulo: e.target.value })} placeholder="Retiro del equipo" className={INPUT} />
          </label>
          <label className="block">
            <span className="text-[11px] text-[#A7A7A7]">Texto completo</span>
            <textarea value={edit.contenido} onChange={(e) => setEdit({ ...edit, contenido: e.target.value })} rows={4} className={`${INPUT} resize-y`} />
          </label>
          <label className="block">
            <span className="text-[11px] text-[#A7A7A7]">Frase junto a la casilla (opcional)</span>
            <input value={edit.textoCasilla} onChange={(e) => setEdit({ ...edit, textoCasilla: e.target.value })} placeholder="Entiendo que si no retiro mi equipo en 3 meses…" className={INPUT} />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-[#C9C9C4]">
              <input type="checkbox" checked={edit.activa} onChange={(e) => setEdit({ ...edit, activa: e.target.checked })} className="h-4 w-4 accent-[#D7FF4F]" />
              Mostrar al cliente
            </label>
            <label className="flex items-center gap-2 text-xs text-[#C9C9C4]">
              Orden
              <input value={String(edit.orden)} onChange={(e) => setEdit({ ...edit, orden: Number(e.target.value.replace(/\D/g, "")) || 0 })} className={`${INPUT} w-16 py-1 text-center`} />
            </label>
          </div>
          {error && <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setEdit(null)} className={BTN_SEC}>Cancelar</button>
            {edit.id && <button type="button" onClick={() => borrar(edit.id)} disabled={guardando} className={`${BTN} border border-red-400/50 text-red-200 hover:bg-red-400/10`}>Borrar</button>}
            <button type="button" onClick={guardar} disabled={guardando} className={BTN_PRI}>{guardando ? "Guardando…" : "Guardar aviso"}</button>
          </div>
        </div>
      )}
    </section>
  );
}

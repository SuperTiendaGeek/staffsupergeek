"use client";

import { useEffect, useRef, useState } from "react";
import {
  ESTADOS_TRABAJO, MOTIVOS_ESPERA, NOVEDAD_MAX, NOVEDAD_MIN,
  type EstadoTrabajo, type MotivoEspera, type TrabajoVisible,
} from "@/lib/tecnicos/presupuesto/trabajo";

// Avance de un trabajo aprobado (rediseño R2, tablero 2 aprobado el 22-nov).
// Un botón compacto con el estado; al tocarlo, el menú: Por hacer · En proceso
// · En espera ▸ motivo · Hecho. "Novedad" pide una frase que ve el cliente.

const TONO: Record<TrabajoVisible["tono"], string> = {
  gris: "border-[#4A4A45] bg-[#2C2D29] text-[#D6D6D0]",
  azul: "border-[rgba(120,183,255,.4)] bg-[rgba(120,183,255,.12)] text-[#9CCBFF]",
  ambar: "border-[rgba(255,181,71,.35)] bg-[rgba(255,181,71,.12)] text-[#FFB547]",
  verde: "border-[rgba(86,227,164,.3)] bg-[rgba(86,227,164,.12)] text-[#56E3A4]",
};

function Icono({ estado }: { estado: EstadoTrabajo }) {
  if (estado === "Hecho") return <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.3l2.3 2.2 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>;
  if (estado === "En espera") return <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M6 3.6V6l1.6 1" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>;
  if (estado === "En proceso") return <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M6 1.4a4.6 4.6 0 0 1 0 9.2z" fill="currentColor" /></svg>;
  return <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>;
}

export function EstadoTrabajo({ ordenId, lineaId, visible, deshabilitado, onCambiado }: {
  ordenId: string;
  lineaId: string;
  visible: TrabajoVisible;
  deshabilitado?: boolean;
  onCambiado: () => void | Promise<void>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [espera, setEspera] = useState(false);
  const [novedad, setNovedad] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [destello, setDestello] = useState(0);
  // El menú flota sobre la página (la tabla del presupuesto recorta lo que se sale).
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null);
  const caja = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) cerrar(); };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar(); };
    const mover = () => cerrar();
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    window.addEventListener("resize", mover);
    window.addEventListener("scroll", mover, true);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
      window.removeEventListener("resize", mover);
      window.removeEventListener("scroll", mover, true);
    };
  }, [abierto]);

  function abrir() {
    const r = boton.current?.getBoundingClientRect();
    if (r) {
      const left = Math.max(8, Math.min(r.left, window.innerWidth - 232));
      // Cerca del borde de abajo, el menú se abre hacia arriba.
      setPos(r.bottom + 300 > window.innerHeight ? { bottom: window.innerHeight - r.top + 4, left } : { top: r.bottom + 4, left });
    }
    setAbierto(true);
  }

  function cerrar() { setAbierto(false); setEspera(false); setNovedad(null); setError(null); }

  async function guardar(estado: EstadoTrabajo, motivo?: MotivoEspera, frase?: string) {
    if (guardando) return;
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/presupuesto/${encodeURIComponent(lineaId)}/trabajo`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado, motivo: motivo ?? null, novedad: frase ?? null }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || "No se pudo guardar el avance.");
      cerrar();
      setDestello((n) => n + 1);
      await onCambiado();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el avance.");
    } finally {
      setGuardando(false);
    }
  }

  const opcion = "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-semibold text-[#F0F0EC] transition hover:bg-[#2C2D29] disabled:opacity-50";

  return (
    <div ref={caja} className="relative inline-block">
      <button
        key={destello}
        ref={boton}
        type="button"
        disabled={deshabilitado || guardando}
        onClick={() => (abierto ? cerrar() : abrir())}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label={`Avance: ${visible.texto}. Cambiar`}
        title={visible.automatico ? "Se pone solo mientras Logística trae el repuesto o falta el anticipo" : undefined}
        className={`inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-[7px] border px-2 text-[11px] font-bold transition-colors duration-200 disabled:opacity-60 ${TONO[visible.tono]} ${destello ? "animate-[sg-destello_700ms_ease-out]" : ""}`}
      >
        <Icono estado={visible.estado} />
        {guardando ? "Guardando…" : visible.texto}
      </button>

      {abierto && pos && (
        <div role="menu" style={{ position: "fixed", top: pos.top, bottom: pos.bottom, left: pos.left }} className="z-[60] w-56 rounded-[10px] border border-[#3A3A36] bg-[#1E1F1C] p-1 shadow-2xl animate-[sg-entrada_140ms_ease-out]">
          {novedad === null ? (
            <>
              {ESTADOS_TRABAJO.map((e) => e === "En espera" ? (
                <div key={e}>
                  <button type="button" role="menuitem" className={opcion} onClick={() => setEspera((v) => !v)} aria-expanded={espera}>
                    <span className="text-[#FFB547]"><Icono estado={e} /></span>
                    <span className="flex-1">En espera</span>
                    <span className="text-[#B5B5AE]">{espera ? "▾" : "▸"}</span>
                  </button>
                  {espera && (
                    <div className="ml-6 border-l border-[#3A3A36] pl-1 animate-[sg-entrada_120ms_ease-out]">
                      {MOTIVOS_ESPERA.map((m) => (
                        <button key={m} type="button" role="menuitem" disabled={guardando}
                          className={`${opcion} font-medium`}
                          onClick={() => (m === "Novedad" ? setNovedad(visible.novedad || "") : void guardar("En espera", m))}>
                          {m}
                          {visible.estado === "En espera" && visible.motivo === m && !visible.automatico && <span className="ml-auto text-[#D7FF4F]">✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <button key={e} type="button" role="menuitem" disabled={guardando} className={opcion} onClick={() => void guardar(e)}>
                  <span className={e === "Hecho" ? "text-[#56E3A4]" : e === "En proceso" ? "text-[#9CCBFF]" : "text-[#D6D6D0]"}><Icono estado={e} /></span>
                  <span className="flex-1">{e}</span>
                  {visible.estado === e && !visible.automatico && <span className="text-[#D7FF4F]">✓</span>}
                </button>
              ))}
            </>
          ) : (
            <div className="space-y-1.5 p-1.5 animate-[sg-entrada_120ms_ease-out]">
              <span className="block text-[11px] font-semibold text-[#B5B5AE]">Qué pasó</span>
              <textarea
                autoFocus
                rows={3}
                maxLength={NOVEDAD_MAX}
                value={novedad}
                onChange={(e) => setNovedad(e.target.value)}
                className="w-full resize-none rounded-md border border-[#3A3A36] bg-[#151613] px-2 py-1.5 text-xs text-[#F0F0EC] outline-none focus:border-[#D7FF4F]"
              />
              <span className="flex items-center gap-1 text-[10.5px] font-semibold text-[#D7FF4F]">
                <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" fill="none" stroke="currentColor" strokeWidth="1.4" /><circle cx="8" cy="8" r="2" fill="currentColor" /></svg>
                El cliente lo ve en su enlace
              </span>
              <div className="flex justify-end gap-1.5">
                <button type="button" onClick={() => setNovedad(null)} className="h-7 rounded-md border border-[#3A3A36] px-2.5 text-[11px] font-semibold text-[#F0F0EC]">Volver</button>
                <button type="button" disabled={guardando || novedad.trim().length < NOVEDAD_MIN} onClick={() => void guardar("En espera", "Novedad", novedad)}
                  className="h-7 rounded-md bg-[#D7FF4F] px-2.5 text-[11px] font-bold text-[#151613] disabled:opacity-50">Guardar</button>
              </div>
            </div>
          )}
          {error && <p role="alert" className="px-2 pb-1 text-[11px] text-[#FF7A70] animate-[sg-sacudir_240ms_ease-out]">{error}</p>}
        </div>
      )}
    </div>
  );
}

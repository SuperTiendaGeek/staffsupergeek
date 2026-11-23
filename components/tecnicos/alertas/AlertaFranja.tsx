"use client";

import { useEffect, useState } from "react";
import { CONFIG_INICIAL, proximoDiaHabil, textoFecha, type AccionAlerta, type Alerta, type Horario } from "@/lib/tecnicos/alertas/reglas";
import { avisarCambioAlertas } from "./tipos";

// Franja de alerta dentro de la orden (rediseño R10, tablero 10 C y E): una
// línea bajo la cabecera con lo que pasa, desde cuándo, la acción a un clic
// (si la cabecera no la tiene ya) y «Posponer» con fecha y motivo.

const ACCIONES: Record<Exclude<AccionAlerta, null>, string> = {
  presupuesto: "Ir a Trabajos",
  escribir: "Escribir al cliente",
  anotar: "Anotar avance",
  completar: "Pasar a Completado",
};

export function AlertaFranja({ ordenId, refrescar, onAccion }: {
  ordenId: string;
  /** Cambia cuando algo pudo mover la alerta (estado, trabajos, actividad, responsable). */
  refrescar?: string | number;
  onAccion: (accion: Exclude<AccionAlerta, null>) => void;
}) {
  const [alerta, setAlerta] = useState<Alerta | null>(null);
  // Horario guardado en Ajustes (para «Mañana» y el próximo día hábil).
  const [horario, setHorario] = useState<Horario>(CONFIG_INICIAL.horario);
  const [posponiendo, setPosponiendo] = useState(false);
  const [fecha, setFecha] = useState("");
  const [otra, setOtra] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/alerta`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!vivo || !j.success) return;
        setAlerta(j.data as Alerta | null);
        if (j.horario) setHorario(j.horario as Horario);
      })
      .catch(() => {});
    return () => { vivo = false; };
  }, [ordenId, refrescar]);

  if (!alerta || alerta.nivel === "alDia") return null;

  const ahora = new Date();
  const manana = proximoDiaHabil(ahora, horario, 1);
  const pasado = proximoDiaHabil(ahora, horario, 2);
  // El error se evita donde nace: «Posponer» se activa con fecha y motivo.
  const listo = /^\d{4}-\d{2}-\d{2}$/.test(fecha) && fecha >= manana && motivo.trim().length >= 5;
  const roja = alerta.nivel === "atencion";
  const texto = alerta.clave === "repuestoAtrasado" ? alerta.texto : `${alerta.texto} · hace ${alerta.hace}`;

  function abrirPosponer() {
    setFecha(manana);
    setOtra(false);
    setMotivo("");
    setError(null);
    setPosponiendo(true);
  }

  async function posponer() {
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/alerta`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hasta: fecha, motivo }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "No se pudo posponer.");
      setAlerta((a) => (a ? { ...a, nivel: "alDia", pospuestaHasta: j.data.hasta } : a));
      setPosponiendo(false);
      avisarCambioAlertas();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo posponer.");
    } finally {
      setGuardando(false);
    }
  }

  const seg = (on: boolean) => `h-7 px-2.5 text-xs font-bold ${on ? "bg-[rgba(215,255,79,.12)] text-[#D7FF4F]" : "bg-[#1E1F1C] text-[#B5B5AE]"}`;
  const btn = "inline-flex h-[30px] items-center justify-center whitespace-nowrap rounded-lg border px-3 text-xs font-semibold transition disabled:opacity-50";

  return (
    <section role="alert"
      className={`rounded-xl border px-4 py-2 animate-[sg-entrada_200ms_ease-out] ${roja ? "border-[rgba(255,122,112,.45)] bg-[rgba(255,122,112,.1)]" : "border-[rgba(255,181,71,.35)] bg-[rgba(255,181,71,.07)]"}`}>
      <div className="flex flex-wrap items-center gap-2.5">
        <span className={`h-2 w-2 shrink-0 rounded-full ${roja ? "bg-[#FF7A70]" : "bg-[#FFB547]"}`} />
        <b className={`text-sm ${roja ? "text-[#FF9C94]" : "text-[#FFB547]"}`}>{texto}</b>
        <div className="flex-1" />
        {alerta.accion && !posponiendo && (
          <button type="button" onClick={() => onAccion(alerta.accion!)} className={`${btn} border-[#D7FF4F] bg-[#D7FF4F] text-[#151613]`}>{ACCIONES[alerta.accion]}</button>
        )}
        {!posponiendo && (
          <button type="button" onClick={abrirPosponer} className={`${btn} border-[#3A3A36] bg-[#252622] text-[#F0F0EC] hover:border-[#D7FF4F]`}>Posponer</button>
        )}
      </div>
      {posponiendo && (
        <form onSubmit={(e) => { e.preventDefault(); if (listo) void posponer(); }} className="mt-2 flex flex-wrap items-center gap-2 animate-[sg-entrada_140ms_ease-out]">
          <div role="radiogroup" aria-label="Hasta" className="inline-flex overflow-hidden rounded-lg border border-[#3A3A36]">
            <button type="button" role="radio" aria-checked={!otra && fecha === manana} onClick={() => { setOtra(false); setFecha(manana); }} className={seg(!otra && fecha === manana)}>Mañana</button>
            <button type="button" role="radio" aria-checked={!otra && fecha === pasado} onClick={() => { setOtra(false); setFecha(pasado); }} className={`${seg(!otra && fecha === pasado)} border-l border-[#3A3A36] capitalize`}>{textoFecha(pasado).replace(/ \S+$/, "")}</button>
            <button type="button" role="radio" aria-checked={otra} onClick={() => setOtra(true)} className={`${seg(otra)} border-l border-[#3A3A36]`}>Fecha…</button>
          </div>
          {otra && (
            <input type="date" value={fecha} min={manana} onChange={(e) => setFecha(e.target.value)} aria-label="Fecha"
              className="h-7 rounded-lg border border-[#3A3A36] bg-[#151613] px-2 text-xs text-[#F0F0EC] outline-none focus:border-[#D7FF4F] [color-scheme:dark]" />
          )}
          <input autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (lo ve el equipo)" aria-label="Motivo" maxLength={200}
            className="h-[30px] min-w-[14rem] flex-1 rounded-lg border border-[#3A3A36] bg-[#151613] px-2.5 text-sm text-[#F0F0EC] outline-none placeholder:text-[#8A8A84] focus:border-[#D7FF4F]" />
          <button type="submit" disabled={guardando || !listo} title={listo ? undefined : "Elige la fecha y escribe el motivo"} className={`${btn} border-[#D7FF4F] bg-[#D7FF4F] text-[#151613]`}>{guardando ? "Guardando…" : "Posponer"}</button>
          <button type="button" onClick={() => setPosponiendo(false)} className="text-xs font-semibold text-[#B5B5AE] hover:text-white">Cancelar</button>
          {error && <span role="alert" className="w-full text-xs text-[#FF9C94] animate-[sg-sacudir_240ms_ease-out]">{error}</span>}
        </form>
      )}
    </section>
  );
}

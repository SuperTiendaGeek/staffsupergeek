"use client";

import { useEffect, useState } from "react";
import { MotivosSelector } from "@/components/tecnicos/motivos/MotivosSelector";
import { dijoElCliente, type MotivoCorto } from "@/lib/tecnicos/motivos/reglas";

// «Motivo de ingreso» en la orden (rediseño R1 + R7, tablero 1): lo primero
// que mira el técnico. Chips + lo que dijo el cliente; «Editar» abre el mismo
// selector del registro. El cambio queda en la Actividad.

const conTexto = (v?: string | null) => !!v && !/^\s*(\\?-|no disponible)\s*$/i.test(v);

export function MotivoIngresoCard({ ordenId, diagnostico, recomendaciones, onCambio, onMotivos }: {
  ordenId: string;
  diagnostico?: string | null;
  recomendaciones?: string | null;
  onCambio?: () => void;
  /** Los chips actuales (la pantalla los usa para el Asistente y el próximo mantenimiento). */
  onMotivos?: (motivos: MotivoCorto[]) => void;
}) {
  const [motivos, setMotivos] = useState<MotivoCorto[] | null>(null);
  const [ingresaPor, setIngresaPor] = useState("");
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState<MotivoCorto[]>([]);
  const [dice, setDice] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(false);
  const [destello, setDestello] = useState(0);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/motivos`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (vivo && j.success) { setMotivos(j.data.motivos); setIngresaPor(j.data.ingresaPor ?? ""); onMotivos?.(j.data.motivos); } })
      .catch(() => { if (vivo) setMotivos([]); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordenId]);

  const nombres = (motivos ?? []).map((m) => m.nombre);
  const cliente = dijoElCliente(ingresaPor, nombres);

  function abrir() {
    setBorrador(motivos ?? []);
    setDice(dijoElCliente(ingresaPor, nombres) || (nombres.length ? "" : ingresaPor.replace(/^\s*(\\?-|no disponible)\s*$/i, "")));
    setError(null);
    setIntento(false);
    setEditando(true);
  }

  async function guardar() {
    setIntento(true);
    if (!borrador.length) { setError("Elige al menos un motivo."); return; }
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/motivos`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivoIds: borrador.map((m) => m.id), clienteDice: dice }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || "No se pudo guardar.");
      setMotivos(j.data.motivos);
      setIngresaPor(j.data.ingresaPor ?? "");
      onMotivos?.(j.data.motivos);
      setEditando(false);
      setDestello((n) => n + 1);
      onCambio?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    // Sin overflow-hidden: la lista del buscador se sale de la tarjeta.
    <section className="relative rounded-xl border border-[var(--sg-border)] bg-[var(--sg-card)] px-4 py-3 shadow-[var(--sg-shadow-card)]">
      <div className="absolute inset-y-0 left-0 w-[3px] rounded-l-xl bg-[var(--sg-lime)]" />
      <div className="flex items-center gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--sg-lime)]">Motivo de ingreso</p>
        {!editando && motivos && (
          <button type="button" onClick={abrir} className="ml-auto text-xs text-[var(--sg-lime)] hover:underline">
            {motivos.length ? "Editar" : "Elegir motivos"}
          </button>
        )}
      </div>

      {editando ? (
        <div className="mt-2 space-y-2 animate-[sg-entrada_140ms_ease-out]">
          <MotivosSelector valor={borrador} onCambio={setBorrador} autoFocus invalido={intento} deshabilitado={guardando} />
          <label className="flex items-center gap-2 rounded-lg border border-[#3A3A36] bg-[#151613] px-2.5 focus-within:border-[#D7FF4F]">
            <span className="shrink-0 text-xs text-[#B5B5AE]">Cliente dice:</span>
            <input value={dice} onChange={(e) => setDice(e.target.value)} disabled={guardando} placeholder="(opcional)"
              className="h-8 min-w-0 flex-1 bg-transparent text-sm text-[#F0F0EC] outline-none placeholder:text-[#8A8A84]" />
          </label>
          {error && <p role="alert" className="text-xs text-[#FF7A70] animate-[sg-sacudir_240ms_ease-out]">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditando(false)} disabled={guardando} className="h-7 px-2 text-xs font-semibold text-[#B5B5AE] hover:text-white">Cancelar</button>
            <button type="button" onClick={() => void guardar()} disabled={guardando} className="h-7 rounded-lg bg-[#D7FF4F] px-3 text-xs font-bold text-[#151613] disabled:opacity-50">
              {guardando ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      ) : motivos === null ? (
        <div className="mt-2 h-[26px]" aria-hidden="true" />
      ) : (
        <div key={destello} className={destello ? "animate-[sg-destello_700ms_ease-out]" : ""}>
          {motivos.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {motivos.map((m) => (
                <span key={m.id} className="inline-flex h-[26px] items-center rounded-full bg-[rgba(215,255,79,.12)] px-[11px] text-[13px] font-bold text-[#D7FF4F]">{m.nombre}</span>
              ))}
            </div>
          )}
          {cliente && (
            <p className="mt-1.5 text-sm leading-snug text-[var(--sg-text-primary)]">
              {motivos.length > 0 && <span className="text-[11px] font-semibold text-[var(--sg-text-muted)]">Dijo el cliente </span>}
              {motivos.length > 0 ? `«${cliente}»` : cliente}
            </p>
          )}
          {!motivos.length && !cliente && <p className="mt-1 text-sm text-[var(--sg-text-muted)]">Sin motivo</p>}
        </div>
      )}

      {!editando && conTexto(diagnostico) && (
        <p className="mt-1.5 text-xs text-[var(--sg-text-primary)]"><span className="font-semibold text-[var(--sg-text-muted)]">Diagnóstico </span>{diagnostico}</p>
      )}
      {!editando && conTexto(recomendaciones) && (
        <p className="mt-1 text-xs text-[var(--sg-text-secondary)]"><span className="font-semibold text-[var(--sg-text-muted)]">Recomendaciones </span>{recomendaciones}</p>
      )}
    </section>
  );
}

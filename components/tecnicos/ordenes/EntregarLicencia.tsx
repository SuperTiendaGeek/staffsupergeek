"use client";

import { useState } from "react";

// Entregar licencia en una línea del presupuesto (auditoría ops, punto 5B).
// La licencia se elige al ENTREGAR (caso OR000517). Compacto: un botón que
// despliega la lista de licencias libres del mismo producto (la comprada hace
// más tiempo primero). "Reemplazar" pide el motivo: si la anterior ya llegó al
// cliente (tiene PDF) queda anulada; si no, vuelve al inventario.

type Candidata = { id: string; sku: string; fechaCompra: string | null; proveedor: string | null; pista: string };

const BTN = "inline-flex h-6 items-center gap-1 rounded-[var(--sg-radius-sm)] border px-2 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

function fecha(v: string | null) {
  if (!v) return "";
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "short", timeZone: "UTC" }).format(new Date(t)) : v;
}

export function EntregarLicencia({ ordenId, lineaId, modo, onListo }: {
  ordenId: string;
  lineaId: string;
  modo: "elegir" | "reemplazar";
  onListo: () => void | Promise<void>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [lista, setLista] = useState<Candidata[] | null>(null);
  const [elegida, setElegida] = useState<string>("");
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/presupuesto/${encodeURIComponent(lineaId)}/licencia`;

  const abrir = async () => {
    if (abierto) { setAbierto(false); return; }
    setAbierto(true); setError(null); setLista(null); setElegida("");
    try {
      const res = await fetch(base, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || "No se pudieron leer las licencias.");
      setLista(j.data as Candidata[]);
      if ((j.data as Candidata[]).length) setElegida((j.data as Candidata[])[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
      setLista([]);
    }
  };

  const confirmar = async () => {
    if (!elegida || ocupado) return;
    if (modo === "reemplazar" && !motivo.trim()) { setError("Escribe el motivo del reemplazo."); return; }
    setOcupado(true); setError(null);
    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: modo, productoId: elegida, motivo }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || "No se pudo entregar la licencia.");
      setAbierto(false);
      await onListo();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="mt-1">
      <button type="button" onClick={() => void abrir()}
        className={modo === "elegir"
          ? `${BTN} border-[var(--sg-lime)]/50 bg-[var(--sg-lime)]/10 text-[var(--sg-lime)] hover:brightness-110`
          : `${BTN} border-[var(--sg-border)] text-[var(--sg-text-secondary)] hover:border-[var(--sg-lime)] hover:text-[var(--sg-text-primary)]`}>
        {modo === "elegir" ? "Entregar licencia" : "Reemplazar"}
      </button>
      {abierto && (
        <div className="mt-1.5 space-y-1.5 rounded-[var(--sg-radius-sm)] border border-[var(--sg-border)] bg-[var(--sg-panel)] p-2 animate-[sg-entrada_180ms_ease-out]">
          {lista === null && <p className="text-[11px] text-[var(--sg-text-muted)]">Buscando licencias…</p>}
          {lista && lista.length === 0 && (
            <p className="text-[11px] text-[var(--sg-text-muted)]">
              No hay licencias libres de este producto.{" "}
              <a href="/tecnicos/productos-digitales" target="_blank" rel="noreferrer" className="font-semibold text-[var(--sg-lime)] hover:underline">Registrar una</a>
              {" "}y vuelve a abrir.
            </p>
          )}
          {lista && lista.length > 0 && (
            <ul className="max-h-40 space-y-0.5 overflow-y-auto">
              {lista.map((c) => (
                <li key={c.id}>
                  <label className={`flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[11px] transition ${elegida === c.id ? "bg-[var(--sg-lime-soft)]" : "hover:bg-[var(--sg-card)]"}`}>
                    <input type="radio" name={`lic-${lineaId}`} checked={elegida === c.id} onChange={() => setElegida(c.id)} className="accent-[var(--sg-lime)]" />
                    <span className="font-mono text-[var(--sg-text-secondary)]">{c.sku}</span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[var(--sg-text-primary)]">{c.pista}</span>
                    <span className="shrink-0 text-[var(--sg-text-muted)]">{[c.proveedor, fecha(c.fechaCompra)].filter(Boolean).join(" · ")}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {modo === "reemplazar" && lista && lista.length > 0 && (
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (p. ej. la clave no activa)" maxLength={200}
              className="h-7 w-full rounded-[var(--sg-radius-sm)] border border-[var(--sg-border)] bg-[var(--sg-card)] px-2 text-xs text-[var(--sg-text-primary)] placeholder:text-[var(--sg-text-muted)] focus:border-[var(--sg-lime)] focus:outline-none" />
          )}
          {error && <p className="text-[11px] text-[var(--sg-danger)] animate-[sg-sacudir_300ms_ease-out]">{error}</p>}
          {lista && lista.length > 0 && (
            <div className="flex justify-end gap-1.5">
              <button type="button" onClick={() => setAbierto(false)} className="text-[11px] text-[var(--sg-text-muted)] hover:text-[var(--sg-text-primary)]">Cancelar</button>
              <button type="button" disabled={!elegida || ocupado} onClick={() => void confirmar()}
                className={`${BTN} border-[var(--sg-lime)] bg-[var(--sg-lime)] text-[#1E1F1C] hover:brightness-95`}>
                {ocupado ? "…" : modo === "elegir" ? "Entregar" : "Reemplazar"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

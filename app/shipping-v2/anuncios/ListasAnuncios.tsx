"use client";

// Pestaña Anuncios (punto 10d-4): anuncios por retirar, por actualizar y
// retirados. Facebook no deja revisar sus anuncios automáticamente: el
// empleado abre el enlace, lo quita en el canal y marca "Retirado".

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2 } from "lucide-react";
import { GestorPublicacionesModal } from "@/components/shipping-v2/publicaciones/GestorPublicacionesModal";
import type { AnuncioPendiente, Publicacion } from "@/lib/shipping-v2/publicaciones";

export type VistaLista = "retirar" | "actualizar" | "retirados";

const botonClass = "inline-flex h-7 items-center gap-1.5 rounded-lg border border-[#3A3B35] bg-[#1A1B17] px-2.5 text-[12px] font-semibold text-[#EDEDE7] transition hover:border-[#D7FF4F]/50 disabled:opacity-50";
const cabecera = "grid gap-2.5 border-b border-[#30312D] px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-[#8F908A]";
const fila = "grid items-center gap-2.5 border-b border-[#252622] px-3 py-2 text-[12.5px] last:border-b-0";
const COLUMNAS = "md:grid-cols-[104px_minmax(0,1fr)_120px_190px]";

function fecha(valor?: string) {
  if (!valor) return "";
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("es-EC", { day: "2-digit", month: "short" });
}

function quien(p: Publicacion) {
  return p.alcance === "Unidad" ? "aparte" : "";
}

export function ListasAnuncios({
  vista,
  porRetirar,
  porActualizar,
  retirados,
}: {
  vista: VistaLista;
  porRetirar: AnuncioPendiente[];
  porActualizar: AnuncioPendiente[];
  retirados: Publicacion[];
}) {
  const router = useRouter();
  const [hechos, setHechos] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [gestor, setGestor] = useState<Publicacion | null>(null);

  async function retirar(p: Publicacion) {
    setBusy(p.id);
    setMensaje("");
    try {
      const response = await fetch("/api/shipping-v2/publicaciones/retirar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(String(payload.error || "No se pudo marcar."));
      setHechos((h) => new Set(h).add(p.id));
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setBusy("");
    }
  }

  const lista = vista === "retirar" ? porRetirar : vista === "actualizar" ? porActualizar : [];
  const visibles = lista.filter((a) => !hechos.has(a.publicacion.id));

  return (
    <div className="space-y-2">
      {mensaje ? <p className="text-[12.5px] text-[#FFB07A]">{mensaje}</p> : null}
      {vista === "retirados" ? (
        <div className="overflow-hidden rounded-xl border border-[#30312D] bg-[#171814]">
          <div className={`${cabecera} hidden ${COLUMNAS} md:grid`}><span>SKU</span><span>Anuncio</span><span>Canal</span><span>Retirado</span></div>
          {retirados.length ? retirados.map((p) => (
            <div key={p.id} className={`${fila} ${COLUMNAS}`}>
              <span className="font-mono font-semibold">{p.sku}</span>
              <span className="truncate" title={p.titulo}>{p.titulo || "—"}{quien(p) ? <span className="ml-1.5 text-[#8F908A]">· {quien(p)}</span> : null}</span>
              <span>{p.canal}</span>
              <span className="text-[#B4B5AC]">{[p.retiradoPor, fecha(p.fechaRetirado)].filter(Boolean).join(" · ") || "—"}</span>
            </div>
          )) : <p className="px-3 py-6 text-center text-[12.5px] text-[#8F908A]">Sin anuncios retirados.</p>}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#30312D] bg-[#171814]">
          <div className={`${cabecera} hidden ${COLUMNAS} md:grid`}><span>SKU</span><span>Por qué</span><span>Canal</span><span /></div>
          {visibles.length ? visibles.map(({ publicacion: p, motivo }) => (
            <div key={p.id} className={`${fila} ${COLUMNAS}`}>
              <span className="font-mono font-semibold">{p.sku}</span>
              <span className="min-w-0">
                {motivo}
                {quien(p) ? <span className="ml-1.5 text-[#8F908A]">· {quien(p)}</span> : null}
                {p.fechaPublicado ? <span className="ml-1.5 text-[#7E7F78]">· publicado {fecha(p.fechaPublicado)}</span> : null}
              </span>
              <span>{p.canal}</span>
              <span className="flex items-center justify-end gap-2">
                {p.enlace ? (
                  <a href={p.enlace} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#D7FF4F] hover:underline">
                    Abrir<ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                ) : <span className="text-[12px] text-[#7E7F78]" title="El anuncio no tiene enlace guardado">sin enlace</span>}
                {vista === "retirar" ? (
                  <button type="button" onClick={() => void retirar(p)} disabled={busy === p.id} className={botonClass} title="Ya lo quité del canal">
                    {busy === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}Retirado
                  </button>
                ) : (
                  <button type="button" onClick={() => setGestor(p)} className={botonClass}>Actualizar</button>
                )}
              </span>
            </div>
          )) : (
            <p className="px-3 py-6 text-center text-[12.5px] text-[#8F908A]">
              {vista === "retirar" ? "Ningún anuncio por retirar." : "Todos los anuncios están al día."}
            </p>
          )}
        </div>
      )}
      {gestor ? (
        <GestorPublicacionesModal
          sku={gestor.sku}
          canalInicial={gestor.canal}
          unidadInicialId={gestor.alcance === "Unidad" ? gestor.unidadId : undefined}
          onClose={() => { setGestor(null); router.refresh(); }}
        />
      ) : null}
    </div>
  );
}

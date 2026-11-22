"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { errorFicha, type BorradorFicha, type FichaSolucion } from "@/lib/manual-tecnico/reglas";
import { Destello, IconoHecho, btn, btnMain, cap, entrada, guardar, leerGuardado } from "./ui";
import { leerChatGuardado } from "./AsistentePanel";

// «Guardar en el Manual Técnico» (punto 11B · lienzo aprobado, tablero 7).
// Decisión del dueño: al pasar a Completado la IA arma la ficha con lo que ya
// está en la orden; el técnico solo toca Guardar / Corregir / No hace falta.
// Si la orden ya estaba Completado (hasta 7 días), se ofrece con un toque
// para no gastar IA cada vez que alguien la abre.

type Estado =
  | { fase: "nada" }
  | { fase: "ofrecer" }
  | { fase: "preparando" }
  | { fase: "borrador"; b: BorradorFicha }
  | { fase: "editando"; b: BorradorFicha }
  | { fase: "sin-nada"; motivo: string; b: BorradorFicha | null }
  | { fase: "guardada"; id: string; codigo: string; estado: string; recien: boolean };

const claveBorrador = (ordenId: string) => `sg-manual-borrador:${ordenId}`;
const claveDescartada = (ordenId: string) => `sg-manual-descartada:${ordenId}`;
const fichaVacia: FichaSolucion = { marca: "", modelo: "", sistema: "", sintoma: "", causa: "", solucion: [], noFunciono: "" };

export function GuardarSolucionCard({ ordenId, estadoOrden, recienCompletado }: { ordenId: string; estadoOrden: string; recienCompletado: boolean }) {
  const [estado, setEstado] = useState<Estado>({ fase: "nada" });
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (estadoOrden !== "Completado") { setEstado({ fase: "nada" }); return; }
    let vivo = true;
    fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/manual-tecnico`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!vivo || !j.success) return;
        const d = j.data as { guardada: { id: string; codigo: string; estado: string } | null; proponer: boolean };
        if (d.guardada) { setEstado({ fase: "guardada", ...d.guardada, recien: false }); return; }
        if (!d.proponer || leerGuardado<boolean>("local", claveDescartada(ordenId))) { setEstado({ fase: "nada" }); return; }
        const previo = leerGuardado<BorradorFicha>("local", claveBorrador(ordenId));
        if (previo) { setEstado(previo.proponer ? { fase: "borrador", b: previo } : { fase: "nada" }); return; }
        if (recienCompletado) void preparar();
        else setEstado({ fase: "ofrecer" });
      })
      .catch(() => { /* sin la tarjeta no pasa nada */ });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordenId, estadoOrden, recienCompletado]);

  async function preparar() {
    setEstado({ fase: "preparando" });
    setError(null);
    try {
      const res = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/manual-tecnico/borrador`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat: leerChatGuardado(ordenId) }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) throw new Error(j.error || "La IA no pudo preparar la ficha.");
      const b = j.data as BorradorFicha;
      guardar("local", claveBorrador(ordenId), b);
      setEstado(b.proponer ? { fase: "borrador", b } : { fase: "sin-nada", motivo: b.motivo || "No hay nada nuevo que guardar.", b: b.ficha ? b : null });
    } catch (e) {
      setError(e instanceof Error ? e.message : "La IA no pudo preparar la ficha.");
      setEstado({ fase: "ofrecer" });
    }
  }

  function descartar() {
    guardar("local", claveDescartada(ordenId), true);
    setEstado({ fase: "nada" });
  }

  async function guardarFicha(b: BorradorFicha) {
    const falta = errorFicha(b.ficha);
    if (falta) { setError(falta); setEstado({ fase: "editando", b }); return; }
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/manual-tecnico`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ficha: b.ficha }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) throw new Error(j.error || "No se pudo guardar.");
      guardar("local", claveBorrador(ordenId), null);
      setEstado({ fase: "guardada", id: j.data.id, codigo: j.data.codigo, estado: j.data.estado, recien: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  if (estado.fase === "nada") return null;

  if (estado.fase === "guardada") {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2 rounded-[10px] border border-[rgba(86,227,164,.4)] bg-[rgba(86,227,164,.08)] px-3 py-2 text-[13px] text-[#F0F0EC]">
          <IconoHecho />
          <span>{estado.recien ? "Guardada" : "Solución guardada en el Manual técnico"} como <b>{estado.codigo}</b> · {estado.estado === "Probada" ? "Probada (por verificar)" : estado.estado}</span>
          <Link href={`/tecnicos/manual-tecnico?ver=${estado.id}`} className="ml-auto text-xs font-semibold text-[#D7FF4F] hover:underline">Ver</Link>
        </div>
        {estado.recien && estado.estado === "Probada" && (
          <span className="pl-1 text-xs text-[#B5B5AE]">Se avisó a los administradores para que la verifiquen.</span>
        )}
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-1 rounded-xl border border-[rgba(215,255,79,.45)] bg-[#1E1F1C] px-3.5 py-3 text-[13px] text-[#F0F0EC] shadow-[0_10px_30px_rgba(0,0,0,.35)]">
      <div className="flex items-center gap-2 pb-1.5">
        <Destello className="text-[#D7FF4F]" size={15} />
        <h2 className="text-[13px] font-bold">Guardar en el Manual Técnico</h2>
        <span className="ml-auto text-xs text-[#B5B5AE]">IA · revisa antes</span>
      </div>

      {estado.fase === "ofrecer" && (
        <>
          <p className="leading-relaxed text-[#CFCFCB]">¿Lo que se encontró en esta orden le sirve a otro técnico? La IA arma la ficha con el historial; tú solo revisas.</p>
          <div className="flex gap-2 pt-2">
            <button type="button" className={`${btnMain} flex-1`} onClick={() => void preparar()}>Preparar la ficha</button>
            <button type="button" className={btn} onClick={descartar}>No hace falta</button>
          </div>
        </>
      )}

      {estado.fase === "preparando" && <p className="py-2 text-[#B5B5AE]">Leyendo el historial y armando la ficha…</p>}

      {estado.fase === "sin-nada" && (
        <>
          <p className="leading-relaxed text-[#CFCFCB]">{estado.motivo}</p>
          <div className="flex gap-2 pt-2">
            <button type="button" className={btn} onClick={() => setEstado({ fase: "editando", b: estado.b ?? { proponer: true, motivo: "", ficha: fichaVacia, saleDe: "" } })}>Escribirla igual</button>
            <button type="button" className={`${btn} ml-auto`} onClick={descartar}>Cerrar</button>
          </div>
        </>
      )}

      {estado.fase === "borrador" && (
        <>
          <Campo etiqueta="Equipo">
            <span className="font-semibold">{[estado.b.ficha.marca, estado.b.ficha.modelo].filter(Boolean).join(" ")}</span>
            {estado.b.ficha.sistema && <span className="text-[#B5B5AE]"> · {estado.b.ficha.sistema}</span>}
          </Campo>
          <Campo etiqueta="Síntoma">{estado.b.ficha.sintoma}</Campo>
          {estado.b.ficha.causa && <Campo etiqueta="Causa">{estado.b.ficha.causa}</Campo>}
          {estado.b.ficha.solucion.length > 0 && (
            <Campo etiqueta="Solución">
              <ol className="list-decimal space-y-0.5 pl-5">{estado.b.ficha.solucion.map((p, i) => <li key={i}>{p}</li>)}</ol>
            </Campo>
          )}
          {estado.b.ficha.noFunciono && <Campo etiqueta="No funcionó">{estado.b.ficha.noFunciono}</Campo>}
          {estado.b.saleDe && <Campo etiqueta="Sale de"><span className="text-[#B5B5AE]">{estado.b.saleDe}</span></Campo>}
          <div className="flex gap-2 pt-2">
            <button type="button" className={`${btnMain} flex-1`} disabled={guardando} onClick={() => void guardarFicha(estado.b)}>{guardando ? "Guardando…" : "Guardar"}</button>
            <button type="button" className={btn} disabled={guardando} onClick={() => setEstado({ fase: "editando", b: estado.b })}>Corregir</button>
            <button type="button" className={btn} disabled={guardando} onClick={descartar}>No hace falta</button>
          </div>
        </>
      )}

      {estado.fase === "editando" && (
        <EditorFicha
          b={estado.b}
          guardando={guardando}
          onCambio={(b) => setEstado({ fase: "editando", b })}
          onGuardar={(b) => void guardarFicha(b)}
          onCancelar={() => setEstado(estado.b.proponer ? { fase: "borrador", b: estado.b } : { fase: "nada" })}
        />
      )}

      {error && <p className="pt-1 text-xs text-[#FFB0A8]">{error}</p>}
    </section>
  );
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[86px_1fr] gap-2 border-t border-[#2C2D29] py-1.5 leading-snug">
      <span className={cap}>{etiqueta}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function EditorFicha({ b, guardando, onCambio, onGuardar, onCancelar }: {
  b: BorradorFicha;
  guardando: boolean;
  onCambio: (b: BorradorFicha) => void;
  onGuardar: (b: BorradorFicha) => void;
  onCancelar: () => void;
}) {
  const f = b.ficha;
  const set = (cambio: Partial<FichaSolucion>) => onCambio({ ...b, proponer: true, ficha: { ...f, ...cambio } });
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <Etiqueta texto="Marca"><input className={`${entrada} h-8`} value={f.marca} onChange={(e) => set({ marca: e.target.value })} placeholder="HP" /></Etiqueta>
        <Etiqueta texto="Modelo"><input className={`${entrada} h-8`} value={f.modelo} onChange={(e) => set({ modelo: e.target.value })} placeholder="EliteBook 840 G3" /></Etiqueta>
      </div>
      <Etiqueta texto="Sistema (si importa)"><input className={`${entrada} h-8`} value={f.sistema} onChange={(e) => set({ sistema: e.target.value })} placeholder="Windows 10 Pro" /></Etiqueta>
      <Etiqueta texto="Síntoma"><textarea rows={2} className={`${entrada} py-1.5`} value={f.sintoma} onChange={(e) => set({ sintoma: e.target.value })} /></Etiqueta>
      <Etiqueta texto="Causa"><textarea rows={2} className={`${entrada} py-1.5`} value={f.causa} onChange={(e) => set({ causa: e.target.value })} /></Etiqueta>
      <Etiqueta texto="Solución (un paso por línea)">
        <textarea rows={4} className={`${entrada} py-1.5`} value={f.solucion.join("\n")} onChange={(e) => set({ solucion: e.target.value.split("\n") })} />
      </Etiqueta>
      <Etiqueta texto="No funcionó"><textarea rows={2} className={`${entrada} py-1.5`} value={f.noFunciono} onChange={(e) => set({ noFunciono: e.target.value })} /></Etiqueta>
      <div className="flex gap-2 pt-1">
        <button type="button" className={`${btnMain} flex-1`} disabled={guardando}
          onClick={() => onGuardar({ ...b, ficha: { ...f, solucion: f.solucion.map((p) => p.trim()).filter(Boolean) } })}>
          {guardando ? "Guardando…" : "Guardar"}
        </button>
        <button type="button" className={btn} disabled={guardando} onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  );
}

function Etiqueta({ texto, children }: { texto: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className={cap}>{texto}</span>
      {children}
    </label>
  );
}

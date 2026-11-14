"use client";

// Fotos de una opción en el enlace del cliente (auditoría ops, 14-nov-2026).
// Pedido del dueño: miniaturas en la opción; al tocar el título (o una
// miniatura) se abre una sub-pantalla con las fotos arriba —se deslizan con el
// dedo— y debajo la información de la opción. Tocar una foto la abre a pantalla
// completa (visor). Todo con scroll-snap nativo: fluido y con pellizcar para zoom.

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, X } from "lucide-react";
import type { OpcionCliente } from "@/lib/pedidos-especiales/enlace-reglas";
import type { FotoOpcion } from "@/lib/pedidos-especiales/fotos";

const usd = (n: number) => `$${(Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, "")}`;

/** Fila de miniaturas dentro de la tarjeta de la opción. */
export function MiniaturasOpcion({ fotos, onAbrir }: { fotos: FotoOpcion[]; onAbrir: (indice: number) => void }) {
  if (!fotos.length) return null;
  const VISTAS = 4;
  const resto = fotos.length - VISTAS;
  return (
    <span className="mt-1.5 flex gap-1.5">
      {fotos.slice(0, VISTAS).map((f, i) => (
        <span
          key={f.id}
          role="button"
          tabIndex={0}
          aria-label={`Ver foto ${i + 1} de ${fotos.length}`}
          onClick={(e) => { e.stopPropagation(); onAbrir(i); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onAbrir(i); } }}
          className="relative h-11 w-11 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-[#3A3A36] transition-transform active:scale-95"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={f.miniatura} alt="" loading="lazy" className="h-full w-full object-cover" />
          {i === VISTAS - 1 && resto > 0 && (
            <span className="absolute inset-0 grid place-items-center bg-black/60 text-xs font-bold text-white">+{resto}</span>
          )}
        </span>
      ))}
    </span>
  );
}

/** Fotos en fila deslizable con "imán" a cada foto. */
function Carrusel({ fotos, indice, onIndice, ajuste, onToca, alto }: {
  fotos: FotoOpcion[]; indice: number; onIndice: (i: number) => void; ajuste: "cover" | "contain"; onToca?: () => void; alto: string;
}) {
  const pista = useRef<HTMLDivElement>(null);
  const bloqueo = useRef(false);

  // Posición inicial, sin animación.
  useEffect(() => {
    const el = pista.current;
    if (el) el.scrollLeft = indice * el.clientWidth;
    // Solo al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cuando el índice cambia desde fuera (miniaturas, flechas), se desliza hasta ahí.
  useEffect(() => {
    const el = pista.current;
    if (!el) return;
    const destino = indice * el.clientWidth;
    if (Math.abs(el.scrollLeft - destino) > 2) {
      bloqueo.current = true;
      el.scrollTo({ left: destino, behavior: "smooth" });
      const t = setTimeout(() => { bloqueo.current = false; }, 450);
      return () => clearTimeout(t);
    }
  }, [indice]);

  const alDeslizar = useCallback(() => {
    const el = pista.current;
    if (!el || bloqueo.current || !el.clientWidth) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== indice) onIndice(Math.max(0, Math.min(fotos.length - 1, i)));
  }, [fotos.length, indice, onIndice]);

  return (
    <div
      ref={pista}
      onScroll={alDeslizar}
      className={`flex w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${alto}`}
    >
      {fotos.map((f, i) => (
        <div key={f.id} className="h-full w-full shrink-0 snap-center snap-always">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={f.grande}
            alt={`Foto ${i + 1} de ${fotos.length}`}
            loading={Math.abs(i - indice) <= 1 ? "eager" : "lazy"}
            draggable={false}
            onClick={onToca}
            className={`h-full w-full select-none ${ajuste === "cover" ? "cursor-zoom-in object-cover" : "object-contain"}`}
          />
        </div>
      ))}
    </div>
  );
}

/** Foto a pantalla completa. */
function Visor({ fotos, indice, onIndice, onCerrar }: { fotos: FotoOpcion[]; indice: number; onIndice: (i: number) => void; onCerrar: () => void }) {
  const ir = useCallback((d: number) => onIndice(Math.max(0, Math.min(fotos.length - 1, indice + d))), [fotos.length, indice, onIndice]);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onCerrar(); }
      if (e.key === "ArrowRight") ir(1);
      if (e.key === "ArrowLeft") ir(-1);
    };
    window.addEventListener("keydown", tecla, true);
    return () => window.removeEventListener("keydown", tecla, true);
  }, [ir, onCerrar]);
  return (
    <div role="dialog" aria-modal="true" aria-label="Fotos" className="fixed inset-0 z-[70] flex flex-col bg-black animate-[sg-velo_160ms_ease-out]">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="text-sm tabular-nums text-white/80">{indice + 1} / {fotos.length}</span>
        <button type="button" onClick={onCerrar} aria-label="Cerrar fotos" className="grid h-10 w-10 place-items-center rounded-full bg-white/10 hover:bg-white/20"><X size={20} /></button>
      </div>
      <div className="relative min-h-0 flex-1">
        <Carrusel fotos={fotos} indice={indice} onIndice={onIndice} ajuste="contain" alto="h-full" />
        {indice > 0 && (
          <button type="button" onClick={() => ir(-1)} aria-label="Foto anterior" className="absolute left-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25 sm:grid"><ChevronLeft size={22} /></button>
        )}
        {indice < fotos.length - 1 && (
          <button type="button" onClick={() => ir(1)} aria-label="Foto siguiente" className="absolute right-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25 sm:grid"><ChevronRight size={22} /></button>
        )}
      </div>
      <div className="h-4" />
    </div>
  );
}

/** Sub-pantalla de una opción: fotos arriba, información abajo. */
export function DetalleOpcion({ opcion, indiceInicial = 0, elegida, puedeElegir, onElegir, onCerrar }: {
  opcion: OpcionCliente; indiceInicial?: number; elegida: boolean; puedeElegir: boolean; onElegir: () => void; onCerrar: () => void;
}) {
  const fotos = opcion.fotos;
  const [indice, setIndice] = useState(Math.min(indiceInicial, Math.max(0, fotos.length - 1)));
  const [visor, setVisor] = useState(false);
  const tira = useRef<HTMLDivElement>(null);

  // Bloquea el scroll de la página de atrás y cierra con Escape.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", tecla);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", tecla); };
  }, [onCerrar]);

  // La miniatura activa se mantiene a la vista.
  useEffect(() => {
    const el = tira.current?.children[indice] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [indice]);

  return (
    <div role="dialog" aria-modal="true" aria-label={opcion.descripcion} className="fixed inset-0 z-50 overflow-y-auto bg-[#151613] animate-[sg-panel_220ms_ease-out]">
      <div className="mx-auto flex min-h-full max-w-md flex-col">
        <div className="sticky top-0 z-10 flex items-center gap-2 bg-[#151613]/95 px-3 py-2.5 backdrop-blur">
          <button type="button" onClick={onCerrar} className="flex h-10 items-center gap-1.5 rounded-xl px-2.5 text-sm font-semibold text-[#F0F0EC] hover:bg-[#1E1F1C]">
            <ArrowLeft size={18} aria-hidden /> Volver
          </button>
          {opcion.n > 0 && <span className="ml-auto pr-2 text-xs text-[#B5B5AE]">Opción {opcion.n}</span>}
        </div>

        {fotos.length > 0 && (
          <div className="flex flex-col gap-2.5">
            <div className="relative bg-black">
              <Carrusel fotos={fotos} indice={indice} onIndice={setIndice} ajuste="cover" onToca={() => setVisor(true)} alto="aspect-[4/3]" />
              {fotos.length > 1 && (
                <span className="pointer-events-none absolute bottom-2.5 right-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold tabular-nums text-white">{indice + 1} / {fotos.length}</span>
              )}
            </div>
            {fotos.length > 1 && (
              <div ref={tira} className="flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {fotos.map((f, i) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setIndice(i)}
                    aria-label={`Foto ${i + 1}`}
                    aria-current={i === indice}
                    className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 transition ${i === indice ? "border-[#D7FF4F]" : "border-transparent opacity-60 hover:opacity-100"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.miniatura} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-1 flex-col gap-3 px-[18px] pb-28 pt-4">
          <h2 className="text-lg font-bold leading-snug text-[#F0F0EC]">{opcion.descripcion}{opcion.cantidad > 1 ? ` ×${opcion.cantidad}` : ""}</h2>
          <p className="text-2xl font-extrabold tabular-nums text-[#F0F0EC]">{usd(opcion.subtotal)}</p>
          {opcion.tiempo && <p className="text-sm text-[#B5B5AE]">Llega en {opcion.tiempo}</p>}
          {opcion.nota && <p className="rounded-xl bg-[#1E1F1C] px-3.5 py-3 text-sm leading-relaxed text-[#D6D6D0]">{opcion.nota}</p>}
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 rounded-xl border border-[#3A3A36] px-3.5 py-3 text-sm tabular-nums">
            <dt className="text-[#B5B5AE]">Para confirmar</dt><dd className="text-right font-bold text-[#D7FF4F]">{usd(opcion.paraConfirmar)}</dd>
            {opcion.alRetirar > 0.009 && (<><dt className="text-[#B5B5AE]">Al retirar</dt><dd className="text-right font-semibold text-[#F0F0EC]">{usd(opcion.alRetirar)}</dd></>)}
          </dl>
        </div>

        {puedeElegir && (
          <div className="fixed inset-x-0 bottom-0 z-10 bg-gradient-to-t from-[#151613] via-[#151613]/95 to-transparent px-[18px] pb-5 pt-6">
            <div className="mx-auto max-w-md">
              <button type="button" onClick={onElegir}
                className={`h-[52px] w-full rounded-2xl text-base font-extrabold transition active:scale-[0.99] ${elegida ? "border-2 border-[#D7FF4F] text-[#D7FF4F]" : "bg-[#D7FF4F] text-[#151613]"}`}>
                {elegida ? "✓ Opción elegida" : "Elegir esta opción"}
              </button>
            </div>
          </div>
        )}
      </div>

      {visor && fotos.length > 0 && <Visor fotos={fotos} indice={indice} onIndice={setIndice} onCerrar={() => setVisor(false)} />}
    </div>
  );
}

"use client";

// Lista de órdenes como tablero por etapas (rediseño R8, tableros 16 a 18).
// Cuatro columnas con los estados de siempre; la tarjeta abre la orden. No se
// arrastra: el estado cambia dentro de la orden (avisar al cliente, presupuesto
// enviado…) y la tarjeta se mueve sola, con un destello de 700 ms.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { columnasDelTablero, type FilaTablero, type FiltroTarjeta } from "@/lib/tecnicos/orden/tablero";
import { BORDE_NIVEL, Iniciales, PUNTO_NIVEL, TEXTO_NIVEL, type Responsables } from "./piezas";

type Props = {
  filas: FilaTablero[] | null;
  fallo: boolean;
  responsables: Responsables;
  yo: string | null;
  filtro: FiltroTarjeta;
  buscar: string;
  onBuscarEnTodas: () => void;
  onReintentar: () => void;
};

function Tarjeta({ f, responsables, destello }: { f: FilaTablero; responsables: Responsables; destello: boolean }) {
  const baja = f.baja;
  const nivel = baja ? (baja.nivel === "cumple" ? "atencion" : "porVencer") : f.nivel;
  return (
    <Link
      href={`/tecnicos/ordenes/${encodeURIComponent(f.ordenId)}`}
      title="Abrir la orden"
      className={`block rounded-lg border border-[#33342F] border-l-[3px] bg-[#252622] py-[7px] pl-2 pr-2.5 transition-colors duration-150 hover:border-[#D7FF4F]/60 hover:bg-[#2A2B26] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D7FF4F] ${BORDE_NIVEL[nivel]} ${destello ? "animate-[sg-destello_700ms_ease-out]" : ""}`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <b className="shrink-0 text-xs font-extrabold tabular-nums text-[#D7FF4F]">{f.codigo}</b>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[#F0F0EC]">{f.cliente || "—"}</span>
        <Iniciales id={f.responsableId} responsables={responsables} chico />
      </span>
      <span className="mt-0.5 block truncate text-xs text-[#B5B5AE]">{f.equipo || "—"}</span>
      <span className={`mt-1 flex min-w-0 items-center gap-1.5 text-[11.5px] font-semibold ${TEXTO_NIVEL[nivel]}`}>
        <span className={`h-2 w-2 shrink-0 rounded-full ${PUNTO_NIVEL[nivel]}`} />
        <span className="min-w-0 flex-1 truncate">{f.texto}{f.pospuestaHasta ? " · pospuesta" : ""}</span>
        <span className="shrink-0 font-bold tabular-nums">{f.hace}</span>
      </span>
    </Link>
  );
}

export function TableroOrdenes({ filas, fallo, responsables, yo, filtro, buscar, onBuscarEnTodas, onReintentar }: Props) {
  const columnas = useMemo(() => columnasDelTablero(filas ?? [], { filtro, buscar, yo }), [filas, filtro, buscar, yo]);
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  // En el celular se ve una etapa a la vez; arranca en la que tiene más rojas.
  const [pestana, setPestana] = useState<string | null>(null);
  const activa = pestana ?? [...columnas].sort((a, b) => b.rojas - a.rojas)[0]?.col.estado ?? "En Proceso";

  // Destello cuando una orden cambió de columna desde la última lectura.
  const antes = useRef<Map<string, string> | null>(null);
  const [movidas, setMovidas] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!filas) return;
    const ahora = new Map(filas.map((f) => [f.ordenId, f.estado]));
    if (antes.current) {
      const cambio = new Set(filas.filter((f) => antes.current!.has(f.ordenId) && antes.current!.get(f.ordenId) !== f.estado).map((f) => f.ordenId));
      if (cambio.size) {
        setMovidas(cambio);
        const t = setTimeout(() => setMovidas(new Set()), 800);
        antes.current = ahora;
        return () => clearTimeout(t);
      }
    }
    antes.current = ahora;
  }, [filas]);

  if (!filas) {
    return fallo ? (
      <div className="flex items-center gap-3 rounded-xl border border-[#3A3A36] bg-[#1B1C19] px-3 py-2.5 text-sm">
        <span className="text-[#FF9C94]">No se pudieron leer las órdenes.</span>
        <button type="button" onClick={onReintentar} className="font-bold text-[#D7FF4F] hover:underline">Reintentar</button>
      </div>
    ) : (
      <div className="grid gap-2.5 md:grid-cols-4" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-1.5 rounded-xl border border-[#3A3A36] bg-[#1B1C19] p-2">
            <div className="h-5 w-32 rounded bg-[#252622]" />
            <div className="h-[62px] rounded-lg bg-[#22231F]" />
            <div className="h-[62px] rounded-lg bg-[#22231F]" />
          </div>
        ))}
      </div>
    );
  }

  const nadaCoincide = !!buscar.trim() && columnas.every((c) => !c.tarjetas.length && !c.baja.length);

  return (
    <div className="space-y-2">
      {nadaCoincide && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#3A3A36] bg-[#1B1C19] px-3 py-2 text-[13px] animate-[sg-entrada_160ms_ease-out]">
          <span className="text-[#B5B5AE]">Ninguna orden abierta coincide.</span>
          <button type="button" onClick={onBuscarEnTodas} className="font-bold text-[#D7FF4F] hover:underline">Buscar en todas (Lista) →</button>
        </div>
      )}

      {/* Celular: una etapa a la vez */}
      <div role="tablist" aria-label="Etapa" className="flex border-b border-[#3A3A36] md:hidden">
        {columnas.map((c) => (
          <button key={c.col.estado} type="button" role="tab" aria-selected={activa === c.col.estado} onClick={() => setPestana(c.col.estado)}
            className={`flex h-11 flex-1 flex-col items-center justify-center border-b-2 text-[11.5px] font-bold ${activa === c.col.estado ? "border-[#D7FF4F] text-[#F0F0EC]" : "border-transparent text-[#B5B5AE]"}`}>
            <span>{c.col.corto}</span>
            <span className={`text-xs tabular-nums ${activa === c.col.estado ? "text-[#D7FF4F]" : ""}`}>{c.total}</span>
          </button>
        ))}
      </div>

      <div className="grid items-start gap-2.5 md:grid-cols-4">
        {columnas.map((c) => {
          const abierta = abiertas.has(c.col.estado);
          return (
            <section key={c.col.estado} aria-label={c.col.nombre}
              className={`min-w-0 flex-col rounded-xl border border-[#3A3A36] bg-[#1B1C19] md:flex ${activa === c.col.estado ? "flex" : "hidden"}`}>
              <div className="flex items-center gap-2 px-3 pb-2 pt-2.5 text-[13px] font-extrabold text-[#F0F0EC]" title={c.col.ayuda}>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.col.color }} />
                {c.col.nombre}
                <span className="font-bold tabular-nums text-[#B5B5AE]">{c.total}</span>
                {c.rojas > 0 && (
                  <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-extrabold text-[#FF9C94]" title="Necesitan atención">
                    <span className="h-2 w-2 rounded-full bg-[#FF7A70]" />{c.rojas}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1.5 px-2 pb-2">
                {c.tarjetas.map((f) => <Tarjeta key={f.ordenId} f={f} responsables={responsables} destello={movidas.has(f.ordenId)} />)}
                {!c.tarjetas.length && !c.baja.length && <p className="px-1 py-1.5 text-xs text-[#6E6E68]">Sin órdenes</p>}
              </div>
              {c.baja.length > 0 && (
                <div className="px-2 pb-2">
                  <button type="button" aria-expanded={abierta}
                    onClick={() => setAbiertas((s) => { const n = new Set(s); if (n.has(c.col.estado)) n.delete(c.col.estado); else n.add(c.col.estado); return n; })}
                    title="Esperando respuesta: desde el ingreso. Completada y avisada: desde que se completó."
                    className="flex w-full items-center gap-2 rounded-lg border border-dashed border-[#4A4A44] px-2.5 py-[7px] text-left text-xs font-bold text-[#D6D6D0] transition-colors hover:border-[#FF7A70]/60">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-[#FF7A70]" />
                    Para baja <b className="tabular-nums">{c.baja.length}</b>
                    <span className="ml-auto font-semibold text-[#B5B5AE]">60+ días {abierta ? "▾" : "▸"}</span>
                  </button>
                  {abierta && (
                    <div className="mt-1.5 flex flex-col gap-1.5 animate-[sg-entrada_160ms_ease-out]">
                      {c.baja.map((f) => <Tarjeta key={f.ordenId} f={f} responsables={responsables} destello={false} />)}
                    </div>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

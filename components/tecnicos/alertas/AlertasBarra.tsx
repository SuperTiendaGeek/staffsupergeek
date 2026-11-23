"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { EVENTO_ALERTAS, PUNTO, leerAlertasCompartidas, type DatosAlertas } from "./tipos";

// Botones de alertas en la barra superior (rediseño R10, tablero 10 A y D).
// Rojo «N» solo si hay órdenes que necesitan atención; ámbar «N» si hay por
// vencer; nada si todo está al día. Cuenta TODAS las del taller (decisión del
// dueño, 23-nov). Al tocar: el panel del día (Mías · Todas).

const CADA_MS = 3 * 60_000;

function Campana() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 2.2a4 4 0 0 0-4 4v2.6L2.8 11h10.4L12 8.8V6.2a4 4 0 0 0-4-4zM6.5 12.8a1.6 1.6 0 0 0 3 0" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

export function AlertasBarra() {
  const [datos, setDatos] = useState<DatosAlertas | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [vista, setVista] = useState<"mias" | "todas">("mias");
  const [latido, setLatido] = useState(0);
  const [fallo, setFallo] = useState(false);
  const anterior = useRef<number | null>(null);
  const caja = useRef<HTMLDivElement>(null);

  const cargar = useCallback(async (forzar = true) => {
    try {
      const d = await leerAlertasCompartidas(forzar);
      // Late una vez solo cuando SUBE el número de rojas (no en cada lectura).
      if (anterior.current !== null && d.resumen.atencion > anterior.current) setLatido((n) => n + 1);
      anterior.current = d.resumen.atencion;
      setDatos(d);
      setFallo(false);
    } catch { setFallo(true); /* se intenta otra vez en la próxima vuelta */ }
  }, []);

  useEffect(() => {
    void cargar(false);
    const id = setInterval(() => { if (document.visibilityState === "visible") void cargar(); }, CADA_MS);
    const alVolver = () => { if (document.visibilityState === "visible") void cargar(false); };
    const alCambiar = () => void cargar();
    window.addEventListener(EVENTO_ALERTAS, alCambiar);
    document.addEventListener("visibilitychange", alVolver);
    return () => { clearInterval(id); window.removeEventListener(EVENTO_ALERTAS, alCambiar); document.removeEventListener("visibilitychange", alVolver); };
  }, [cargar]);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", tecla); };
  }, [abierto]);

  if (!datos && fallo) {
    return (
      <button type="button" onClick={() => void cargar(true)} title="No se pudieron leer las alertas · tocar para reintentar" aria-label="Reintentar alertas"
        className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#3A3A36] px-2.5 text-xs font-bold text-[#8A8A84] transition hover:text-[#F0F0EC]">
        <Campana />!
      </button>
    );
  }
  if (!datos || (datos.resumen.atencion === 0 && datos.resumen.porVencer === 0)) return null;
  const { resumen, filas, yo } = datos;

  function abrir() {
    if (!abierto) setVista(resumen.mias > 0 ? "mias" : "todas");
    setAbierto((v) => !v);
  }

  const suenan = filas.filter((f) => f.alerta.nivel !== "alDia");
  const visibles = vista === "mias" ? suenan.filter((f) => f.responsableId === yo) : suenan;
  const rojasMias = suenan.filter((f) => f.responsableId === yo && f.alerta.nivel === "atencion").length;
  const ambarMias = suenan.filter((f) => f.responsableId === yo && f.alerta.nivel === "porVencer").length;
  const seg = (on: boolean) => `h-7 px-2.5 text-xs font-bold ${on ? "bg-[rgba(215,255,79,.12)] text-[#D7FF4F]" : "bg-[#1E1F1C] text-[#B5B5AE]"}`;

  return (
    <div ref={caja} className="relative flex items-center gap-1.5">
      {resumen.atencion > 0 && (
        <button key={latido} type="button" onClick={abrir} aria-expanded={abierto} aria-label={`${resumen.atencion} órdenes necesitan atención`} title="Necesitan atención"
          className={`inline-flex h-9 items-center gap-1.5 rounded-lg border border-[rgba(255,122,112,.6)] bg-[rgba(255,122,112,.12)] px-2.5 text-xs font-bold text-[#FF9C94] transition hover:bg-[rgba(255,122,112,.2)] ${latido ? "animate-[sg-latido_400ms_ease-out]" : ""}`}>
          <Campana />{resumen.atencion}
        </button>
      )}
      {resumen.porVencer > 0 && (
        <button type="button" onClick={abrir} aria-expanded={abierto} aria-label={`${resumen.porVencer} órdenes por vencer`} title="Por vencer"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[rgba(255,181,71,.45)] px-2.5 text-xs font-bold text-[#FFB547] transition hover:bg-[rgba(255,181,71,.08)]">
          <span className="h-2 w-2 rounded-full bg-[#FFB547]" />{resumen.porVencer}
        </button>
      )}

      {abierto && (
        <div role="dialog" aria-label="Órdenes que necesitan atención"
          className="absolute right-0 top-[calc(100%+6px)] z-[70] w-[380px] max-w-[calc(100vw-24px)] overflow-hidden rounded-xl border border-[#3A3A36] bg-[#1E1F1C] text-[13px] text-[#F0F0EC] shadow-2xl animate-[sg-entrada_160ms_ease-out]">
          <div className="flex items-center gap-2 px-3 py-2.5">
            <b>{vista === "mias" ? "Mis pendientes" : "Del taller"}</b>
            {(vista === "mias" ? rojasMias : resumen.atencion) > 0 && (
              <span className="inline-flex h-5 items-center rounded-full bg-[rgba(255,122,112,.14)] px-2 text-[11px] font-bold text-[#FF9C94]">{vista === "mias" ? rojasMias : resumen.atencion}</span>
            )}
            {(vista === "mias" ? ambarMias : resumen.porVencer) > 0 && (
              <span className="inline-flex h-5 items-center rounded-full bg-[rgba(255,181,71,.13)] px-2 text-[11px] font-bold text-[#FFB547]">{vista === "mias" ? ambarMias : resumen.porVencer}</span>
            )}
            <div role="radiogroup" aria-label="Ver" className="ml-auto inline-flex overflow-hidden rounded-lg border border-[#3A3A36]">
              <button type="button" role="radio" aria-checked={vista === "mias"} onClick={() => setVista("mias")} className={seg(vista === "mias")}>Mías</button>
              <button type="button" role="radio" aria-checked={vista === "todas"} onClick={() => setVista("todas")} className={`${seg(vista === "todas")} border-l border-[#3A3A36]`}>Todas</button>
            </div>
          </div>
          <div className="max-h-[50vh] overflow-y-auto">
            {visibles.length === 0 ? (
              <p className="border-t border-[#2C2D29] px-3 py-3 text-xs text-[#B5B5AE]">Nada tuyo por ahora.</p>
            ) : visibles.map((f) => (
              <Link key={f.ordenId} href={`/tecnicos/ordenes/${encodeURIComponent(f.ordenId)}`} onClick={() => setAbierto(false)}
                className="grid grid-cols-[8px_72px_minmax(0,1fr)_auto] items-center gap-2.5 border-t border-[#2C2D29] px-3 py-2 transition hover:bg-[#252622]">
                <span className={`h-2 w-2 rounded-full ${PUNTO[f.alerta.nivel]}`} />
                <b className="font-mono text-[12px]">{f.codigo}</b>
                <span className="truncate">{f.alerta.texto}</span>
                <span className="text-xs tabular-nums text-[#B5B5AE]">{f.alerta.hace}</span>
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-3 border-t border-[#2C2D29] px-3 py-2 text-xs">
            <Link href={`/tecnicos/ordenes?alerta=${vista === "mias" ? "mias" : "atencion"}`} onClick={() => setAbierto(false)} className="text-[#D7FF4F] hover:underline">Abrir en la lista</Link>
            {datos.esAdmin && <Link href="/tecnicos/alertas" onClick={() => setAbierto(false)} className="ml-auto text-[#B5B5AE] hover:text-[#F0F0EC]">Ajustes</Link>}
          </div>
        </div>
      )}
    </div>
  );
}

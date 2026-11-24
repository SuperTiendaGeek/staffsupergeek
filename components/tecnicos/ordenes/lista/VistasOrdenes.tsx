"use client";

// Pantalla de órdenes (rediseño R8): una sola barra arriba y tres vistas.
//   Tablero — las abiertas por etapa (se abre al entrar; se recuerda la última vista de cada persona).
//   Lista   — bandejas Abiertas · Para baja · Entregadas · Reciclaje; el buscador busca en todas.
//   Cobros  — el panel «Cobros y documentos»; carga solo al tocarla (antes eran ~56 consultas al abrir).
// El tablero y la Lista salen de la misma lectura que la barra de alertas.

import { useCallback, useEffect, useRef, useState } from "react";
import { PanelCobros } from "@/components/tecnicos/ordenes/PanelCobros";
import { EVENTO_DATOS_ALERTAS, leerAlertasCompartidas, type DatosAlertas } from "@/components/tecnicos/alertas/tipos";
import { CLAVE_VISTA, leerVista, type Bandeja, type FiltroTarjeta, type Vista } from "@/lib/tecnicos/orden/tablero";
import { IconoLupa } from "./piezas";
import { ListaOrdenes } from "./ListaOrdenes";
import { TableroOrdenes } from "./TableroOrdenes";

const VISTAS: Array<{ clave: Vista; nombre: string }> = [
  { clave: "tablero", nombre: "Tablero" },
  { clave: "lista", nombre: "Lista" },
  { clave: "cobros", nombre: "Cobros" },
];

const FILTROS: ReadonlyArray<readonly [Exclude<FiltroTarjeta, null>, string, string]> = [
  ["atencion", "Atención", "bg-[#FF7A70]"],
  ["porVencer", "Por vencer", "bg-[#FFB547]"],
  ["mias", "Mías", ""],
  ["sinResponsable", "Sin responsable", ""],
];

export function VistasOrdenes({ onNuevaOrden, refresco }: { onNuevaOrden: () => void; refresco: number }) {
  const [vista, setVista] = useState<Vista>("tablero");
  const [bandeja, setBandeja] = useState<Bandeja>("abiertas");
  const [filtro, setFiltro] = useState<FiltroTarjeta>(null);
  const [texto, setTexto] = useState("");
  const [buscar, setBuscar] = useState("");
  const [datos, setDatos] = useState<DatosAlertas | null>(null);
  const [fallo, setFallo] = useState(false);
  const [recarga, setRecarga] = useState(0);
  const caja = useRef<HTMLInputElement>(null);

  // La vista que eligió cada persona la última vez (y los enlaces «Abrir en la lista»: ?alerta=…).
  useEffect(() => {
    try { setVista(leerVista(window.localStorage.getItem(CLAVE_VISTA))); } catch { /* sin almacenamiento: tablero */ }
    const p = new URLSearchParams(window.location.search);
    const a = p.get("alerta");
    if (a === "atencion" || a === "porVencer" || a === "mias" || a === "sinResponsable") setFiltro(a);
    const b = p.get("bandeja");
    if (b === "abiertas" || b === "baja" || b === "entregadas" || b === "reciclaje") { setBandeja(b); setVista("lista"); }
  }, []);

  const elegirVista = (v: Vista) => {
    setVista(v);
    try { window.localStorage.setItem(CLAVE_VISTA, v); } catch { /* nada */ }
  };

  // Misma lectura que la barra de arriba; cuando la barra relee, esto se pone al día solo.
  const cargar = useCallback((forzar: boolean) => {
    leerAlertasCompartidas(forzar)
      .then((d) => { setDatos(d); setFallo(false); })
      .catch(() => setFallo(true));
  }, []);
  useEffect(() => { cargar(refresco > 0 || recarga > 0); }, [cargar, refresco, recarga]);
  useEffect(() => {
    const alLlegar = (e: Event) => { const d = (e as CustomEvent<DatosAlertas>).detail; if (d) { setDatos(d); setFallo(false); } };
    const alVolver = () => { if (document.visibilityState === "visible") cargar(false); };
    window.addEventListener(EVENTO_DATOS_ALERTAS, alLlegar);
    document.addEventListener("visibilitychange", alVolver);
    return () => { window.removeEventListener(EVENTO_DATOS_ALERTAS, alLlegar); document.removeEventListener("visibilitychange", alVolver); };
  }, [cargar]);

  useEffect(() => {
    const t = setTimeout(() => setBuscar(texto.trim()), 300);
    return () => clearTimeout(t);
  }, [texto]);

  const tocarFiltro = (f: Exclude<FiltroTarjeta, null>) => {
    setFiltro((x) => (x === f ? null : f));
    // En la Lista los filtros de alertas son de «Abiertas».
    if (vista === "lista") { setBandeja("abiertas"); setTexto(""); setBuscar(""); }
  };

  const filas = datos ? datos.tablero ?? null : null;
  const resumen = datos?.resumen;
  const responsables = datos?.responsables ?? {};
  const yo = datos?.yo ?? null;

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {vista !== "cobros" && (
          <label className="flex h-9 w-full items-center gap-2 rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-3 text-sm text-[#F5F5F5] transition focus-within:border-[#D7FF4F] sm:w-[300px]">
            <span className="sr-only">Buscar órdenes</span>
            <IconoLupa />
            <input ref={caja} value={texto} onChange={(e) => setTexto(e.target.value)}
              placeholder={vista === "lista" ? "Buscar en todas: cliente, ID o equipo" : "Buscar cliente, ID o equipo"}
              className="h-full w-full bg-transparent text-sm font-medium outline-none placeholder:text-[#A7A7A7]/50" />
            {texto && <button type="button" onClick={() => { setTexto(""); setBuscar(""); caja.current?.focus(); }} aria-label="Borrar búsqueda" className="text-[#A7A7A7] hover:text-[#F0F0EC]">×</button>}
          </label>
        )}

        <div role="radiogroup" aria-label="Ver como" className="inline-flex overflow-hidden rounded-lg border border-[#3A3A36]">
          {VISTAS.map((v, i) => (
            <button key={v.clave} type="button" role="radio" aria-checked={vista === v.clave} onClick={() => elegirVista(v.clave)}
              className={`h-9 px-3 text-xs font-bold transition-colors ${i ? "border-l border-[#3A3A36]" : ""} ${vista === v.clave ? "bg-[rgba(215,255,79,.12)] text-[#D7FF4F]" : "bg-[#1E1F1C] text-[#B5B5AE] hover:text-[#F0F0EC]"}`}>
              {v.nombre}
            </button>
          ))}
        </div>

        {vista !== "cobros" && (
          // En el celular los filtros van en una sola fila que se desliza.
          <div className="order-last -mx-1 flex w-full min-w-0 items-center gap-1.5 overflow-x-auto px-1 sm:order-none sm:mx-0 sm:w-auto sm:overflow-visible sm:px-0">
            <span className="mx-0.5 hidden h-4 w-px bg-[#3A3A36] sm:block" aria-hidden="true" />
            {FILTROS.map(([clave, etiqueta, punto]) => (
              <button key={clave} type="button" onClick={() => tocarFiltro(clave)} aria-pressed={filtro === clave}
                title={fallo && !datos ? "No se pudieron leer las alertas" : undefined}
                className={`inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-xs font-semibold transition ${
                  filtro === clave
                    ? clave === "atencion" ? "border-[#FF7A70] bg-[rgba(255,122,112,.1)] text-white" : "border-[#D7FF4F] bg-[rgba(215,255,79,.08)] text-white"
                    : "border-[#3A3A36] bg-[#1E1F1C] text-[#F0F0EC] hover:border-[#D7FF4F]/50"}`}>
                {punto && <span className={`h-2 w-2 rounded-full ${punto}`} />}{etiqueta} <b className="tabular-nums">{resumen ? resumen[clave] : fallo ? "—" : "…"}</b>
              </button>
            ))}
          </div>
        )}

        <button type="button" onClick={onNuevaOrden} aria-label="Nueva orden"
          className="ml-auto inline-flex h-9 min-w-9 items-center justify-center whitespace-nowrap rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-3 text-sm font-bold text-[#151613] transition hover:brightness-105 sm:px-4">
          +<span className="hidden sm:inline">&nbsp;Nueva orden</span>
        </button>
      </div>

      {vista === "tablero" && (
        <TableroOrdenes filas={filas} fallo={fallo} responsables={responsables} yo={yo} filtro={filtro} buscar={buscar}
          onBuscarEnTodas={() => elegirVista("lista")} onReintentar={() => setRecarga((n) => n + 1)} />
      )}
      {vista === "lista" && (
        <ListaOrdenes filas={filas} responsables={responsables} yo={yo} filtro={filtro} buscar={buscar}
          bandeja={bandeja} onBandeja={(b) => { setBandeja(b); setTexto(""); setBuscar(""); if (b !== "abiertas") setFiltro(null); }} refresco={refresco + recarga} />
      )}
      {vista === "cobros" && <PanelCobros inmediato />}
    </div>
  );
}

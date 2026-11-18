"use client";

// Botón "Pantalla del cliente" de la barra superior, junto a la campanita
// (dueño, 17-nov; maqueta 10). Tres estados: sin segunda pantalla (gris),
// detectada y apagada, proyectando (punto lima). Al tocarlo: encender o
// apagar, el ESPEJO en vivo de lo que ve el cliente, "Volver al reposo" y
// "Ver en grande".
//
// Para abrir la ventana en el monitor del mostrador usa la Window Management
// API de Chrome/Edge (pide permiso una sola vez); sin ella, abre la ventana y
// el empleado la arrastra al monitor.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MonitorSmartphone, X } from "lucide-react";
import { NOMBRE_VENTANA } from "@/lib/pantalla-cliente/reglas";
import { usePantallaCliente } from "./usePantallaCliente";
import { VistaPantalla } from "./VistaPantalla";

type Pantalla = { availLeft: number; availTop: number; availWidth: number; availHeight: number; isPrimary?: boolean };
type DetallesPantallas = { screens: Pantalla[]; currentScreen: Pantalla };

const usd = (n: number) => `$${(Math.round(n * 100) / 100).toFixed(2)}`;

export function BotonPantallaCliente() {
  const { conectada, estado, enviar } = usePantallaCliente();
  const [hayOtra, setHayOtra] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [grande, setGrande] = useState(false);
  const [aviso, setAviso] = useState("");
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const boton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [montado, setMontado] = useState(false);

  useEffect(() => {
    setMontado(true);
    const mirar = () => setHayOtra(!!(window.screen as Screen & { isExtended?: boolean }).isExtended);
    mirar();
    const t = setInterval(mirar, 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!boton.current?.contains(t) && !panel.current?.contains(t)) setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);

  function alternar() {
    const r = boton.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 10, left: Math.max(12, Math.min(r.right - 344, window.innerWidth - 356)) });
    setAviso("");
    setAbierto((a) => !a);
  }

  async function encender() {
    setAviso("");
    let opciones = "popup,width=1280,height=800";
    try {
      if ("getScreenDetails" in window) {
        const d = await (window as unknown as { getScreenDetails: () => Promise<DetallesPantallas> }).getScreenDetails();
        const otras = d.screens.filter((s) => s !== d.currentScreen);
        // El monitor del mostrador es el pequeño (1280×800).
        const destino = otras.sort((a, b) => a.availWidth * a.availHeight - b.availWidth * b.availHeight)[0];
        if (destino) opciones = `popup,left=${destino.availLeft},top=${destino.availTop},width=${destino.availWidth},height=${destino.availHeight}`;
      }
    } catch { /* sin permiso: se abre normal y se arrastra */ }
    const w = window.open("/pantalla-cliente", NOMBRE_VENTANA, opciones);
    if (!w) setAviso("Chrome no dejó abrir la ventana. Toca «Encender» otra vez.");
  }

  const claseBoton = conectada
    ? "border-[#D7FF4F] text-[#D7FF4F]"
    : hayOtra ? "border-[#3A3A36] text-[#CFCFCB]" : "border-[#3A3A36] text-[#6E6E68]";
  const etiqueta = conectada ? "Pantalla del cliente: proyectando" : hayOtra ? "Pantalla del cliente: apagada" : "Pantalla del cliente: no conectada";
  const mostrando = !estado ? "" : estado.vista === "reposo" ? "el logo (reposo)"
    : estado.vista === "cobro" ? `cobro de ${estado.cobro.codigo} · ${usd(estado.cobro.vasAPagar)}`
    : `¡Gracias! · ${estado.cobro.codigo} pagó ${usd(estado.recibido)}`;

  const contenido = abierto && montado ? createPortal(
    <div ref={panel} role="dialog" aria-label="Pantalla del cliente"
      style={{ top: pos.top, left: pos.left }}
      className="fixed z-[9990] flex w-[344px] flex-col gap-3 rounded-xl border border-[#6A6A62] bg-[#1E1F1C] p-3.5 text-[13px] text-[#F0F0EC] shadow-2xl shadow-black/60 animate-[sg-entrada_200ms_ease-out]">
      <div className="flex items-center gap-2">
        <p className="text-sm font-bold">Pantalla del cliente</p>
        {conectada && (
          <button type="button" role="switch" aria-checked="true" aria-label="Apagar la pantalla del cliente" title="Apagar"
            onClick={() => enviar({ tipo: "apagar" })}
            className="relative ml-auto h-5 w-[34px] rounded-full bg-[#D7FF4F]">
            <span className="absolute right-[3px] top-[3px] h-3.5 w-3.5 rounded-full bg-[#151613]" />
          </button>
        )}
      </div>

      {conectada && estado ? (
        <>
          <div className="overflow-hidden rounded-lg border border-[#3A3A36]">
            <VistaPantalla estado={estado} escala={316 / 1280} animar={false} />
          </div>
          <p className="text-xs text-[#B5B5AE]">Mostrando: <b className="text-[#F0F0EC]">{mostrando}</b></p>
          <div className="flex gap-2">
            <button type="button" onClick={() => enviar({ tipo: "reposo" })} disabled={estado.vista === "reposo"}
              className="h-8 flex-1 rounded-lg border border-[#3A3A36] bg-[#252622] text-xs font-semibold disabled:opacity-50">Volver al reposo</button>
            <button type="button" onClick={() => { setGrande(true); setAbierto(false); }}
              className="h-8 flex-1 rounded-lg border border-[#3A3A36] bg-[#252622] text-xs font-semibold">Ver en grande</button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-[#B5B5AE]">
            {hayOtra ? "Pantalla del mostrador detectada." : "No hay una segunda pantalla conectada. Conecta el monitor del mostrador por USB."}
          </p>
          <button type="button" onClick={() => void encender()}
            className={`h-9 rounded-lg text-[13px] font-bold ${hayOtra ? "bg-[#D7FF4F] text-[#151613]" : "border border-[#3A3A36] bg-[#252622] text-[#F0F0EC]"}`}>
            {hayOtra ? "Encender la pantalla del cliente" : "Abrir de todas formas"}
          </button>
        </>
      )}
      {aviso && <p className="text-xs text-[#FFB547]">{aviso}</p>}
    </div>,
    document.body,
  ) : null;

  const modalGrande = grande && montado && estado ? createPortal(
    <div className="fixed inset-0 z-[9991] grid place-items-center bg-black/70 p-4 animate-[sg-velo_200ms_ease-out]" onClick={() => setGrande(false)}>
      <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center text-sm font-bold text-[#F0F0EC]">
          Lo que ve el cliente
          <button type="button" aria-label="Cerrar" onClick={() => setGrande(false)} className="ml-auto grid h-8 w-8 place-items-center rounded-lg border border-[#3A3A36] bg-[#252622]"><X size={14} /></button>
        </div>
        <div className="overflow-hidden rounded-xl border border-[#3A3A36]">
          <VistaPantalla estado={estado} escala={Math.min(0.75, (typeof window !== "undefined" ? window.innerWidth - 40 : 960) / 1280)} />
        </div>
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <div className="relative hidden sm:block">
      <button ref={boton} type="button" onClick={alternar} aria-label={etiqueta} title={etiqueta} aria-expanded={abierto}
        className={`relative grid h-9 w-9 place-items-center rounded-md border bg-[#181916] transition hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F] xl:h-10 xl:w-10 ${claseBoton}`}>
        <MonitorSmartphone className="h-[18px] w-[18px]" aria-hidden />
        {conectada && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[#D7FF4F] shadow-[0_0_0_2px_#181916]" />}
      </button>
      {contenido}
      {modalGrande}
    </div>
  );
}

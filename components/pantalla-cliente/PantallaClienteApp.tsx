"use client";

// La ventana "Pantalla del cliente" (10E-B). Se abre desde el botón de la
// barra superior en el monitor del mostrador. Muestra solo lo que el
// empleado le manda; cada 2 s avisa que está encendida (latido) y su estado,
// para que el portal dibuje el espejo.

import { useEffect, useRef, useState } from "react";
import {
  CANAL_PANTALLA, SEGUNDOS_LATIDO, alLeerLaCuenta, alPasarElTiempo, aplicarComando, reposo,
  type EstadoPantalla, type Mensaje,
} from "@/lib/pantalla-cliente/reglas";
import { ALTO_PANTALLA, ANCHO_PANTALLA, VistaPantalla } from "./VistaPantalla";

export function PantallaClienteApp() {
  const [estado, setEstado] = useState<EstadoPantalla>(() => reposo(Date.now()));
  const [escala, setEscala] = useState(1);
  const [completa, setCompleta] = useState(true);
  const canal = useRef<BroadcastChannel | null>(null);
  const actual = useRef(estado);
  actual.current = estado;

  // Avisar el estado: al cambiar y como latido.
  const avisar = () => canal.current?.postMessage({ de: "pantalla", estado: actual.current, en: Date.now() } satisfies Mensaje);

  useEffect(() => {
    document.title = "Pantalla del cliente · SUPER GEEK";
    const c = new BroadcastChannel(CANAL_PANTALLA);
    canal.current = c;
    c.onmessage = (ev: MessageEvent<Mensaje>) => {
      const m = ev.data;
      if (m?.de !== "portal") return;
      if (m.comando.tipo === "apagar") { window.close(); return; }
      if (m.comando.tipo === "quien_esta") { avisar(); return; }
      setEstado((e) => aplicarComando(e, m.comando, Date.now()));
    };
    const latido = setInterval(avisar, SEGUNDOS_LATIDO * 1000);
    const reloj = setInterval(() => setEstado((e) => alPasarElTiempo(e, Date.now())), 1000);
    avisar();
    return () => { clearInterval(latido); clearInterval(reloj); c.close(); canal.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { avisar(); }, [estado]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mientras cobra: consulta la cuenta para saber si el cliente ya pagó.
  const cobroId = estado.vista === "cobro" ? `${estado.cobro.origen}:${estado.cobro.id}` : "";
  useEffect(() => {
    if (!cobroId) return;
    const [origen, id] = cobroId.split(":");
    let vivo = true;
    const leer = async () => {
      try {
        const r = await fetch(`/api/pantalla-cliente/cobro?origen=${origen}&id=${id}`, { cache: "no-store" });
        const j = (await r.json()) as { success: boolean; data?: { pagado: number; falta: number } };
        if (vivo && j.success && j.data) setEstado((e) => alLeerLaCuenta(e, j.data!, Date.now()));
      } catch { /* sin conexión: se reintenta */ }
    };
    const t = setInterval(() => void leer(), 4000);
    return () => { vivo = false; clearInterval(t); };
  }, [cobroId]);

  // Ajustar 1280×800 al tamaño de la ventana (y saber si está a pantalla completa).
  useEffect(() => {
    const medir = () => {
      setEscala(Math.min(window.innerWidth / ANCHO_PANTALLA, window.innerHeight / ALTO_PANTALLA));
      setCompleta(!!document.fullscreenElement);
    };
    medir();
    window.addEventListener("resize", medir);
    document.addEventListener("fullscreenchange", medir);
    return () => { window.removeEventListener("resize", medir); document.removeEventListener("fullscreenchange", medir); };
  }, []);

  return (
    <main className="fixed inset-0 grid place-items-center overflow-hidden bg-[#151613]">
      <VistaPantalla estado={estado} escala={escala} />
      {!completa && (
        // Chrome pide un toque para la pantalla completa (el monitor es táctil).
        <button type="button" onClick={() => void document.documentElement.requestFullscreen().catch(() => {})}
          className="absolute right-3 top-3 rounded-lg border border-[#3A3A36] bg-[#1E1F1C]/90 px-3 py-2 text-sm font-semibold text-[#B5B5AE]">
          Pantalla completa
        </button>
      )}
    </main>
  );
}

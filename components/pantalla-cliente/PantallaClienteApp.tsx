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

export type AjustesVentana = { segundosGracias: number; minutosSinActividad: number; textoReposo: string };

export function PantallaClienteApp({ ajustes }: { ajustes: AjustesVentana }) {
  const [estado, setEstado] = useState<EstadoPantalla>(() => reposo(Date.now()));
  // 10E-C: tiempos y texto de Administrar (se vuelven a leer cada 5 minutos).
  const [aj, setAj] = useState(ajustes);
  const tiempos = useRef(aj);
  tiempos.current = aj;
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const r = await fetch("/api/pantalla-cliente/config", { cache: "no-store" });
        const j = (await r.json()) as { success: boolean; data?: AjustesVentana };
        if (j.success && j.data) setAj({ segundosGracias: j.data.segundosGracias, minutosSinActividad: j.data.minutosSinActividad, textoReposo: j.data.textoReposo });
      } catch { /* se intenta en la próxima vuelta */ }
    }, 5 * 60_000);
    return () => clearInterval(t);
  }, []);
  const [escala, setEscala] = useState(1);
  const [completa, setCompleta] = useState(true);
  const canal = useRef<BroadcastChannel | null>(null);
  const actual = useRef(estado);
  actual.current = estado;

  // Avisar el estado: al cambiar y como latido.
  const avisar = () => canal.current?.postMessage({ de: "pantalla", estado: actual.current, en: Date.now() } satisfies Mensaje);
  const despedirse = () => canal.current?.postMessage({ de: "pantalla", apagada: true } satisfies Mensaje);

  useEffect(() => {
    document.title = "Pantalla del cliente · SUPER GEEK";
    const c = new BroadcastChannel(CANAL_PANTALLA);
    canal.current = c;
    c.onmessage = (ev: MessageEvent<Mensaje>) => {
      const m = ev.data;
      if (m?.de !== "portal") return;
      if (m.comando.tipo === "apagar") { despedirse(); window.close(); return; }
      if (m.comando.tipo === "quien_esta") { avisar(); return; }
      setEstado((e) => aplicarComando(e, m.comando, Date.now()));
    };
    // Si la cierran a mano (o se desconecta el monitor), también avisa.
    window.addEventListener("pagehide", despedirse);
    const latido = setInterval(avisar, SEGUNDOS_LATIDO * 1000);
    const reloj = setInterval(() => setEstado((e) => alPasarElTiempo(e, Date.now(), tiempos.current)), 1000);
    avisar();
    return () => { window.removeEventListener("pagehide", despedirse); clearInterval(latido); clearInterval(reloj); c.close(); canal.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { avisar(); }, [estado]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mientras cobra: consulta la cuenta para saber si el cliente ya pagó.
  // La prueba de Administrar (id "prueba") no consulta ninguna cuenta.
  const cobroId = estado.vista === "cobro" && /^rec/.test(estado.cobro.id) ? `${estado.cobro.origen}:${estado.cobro.id}` : "";
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
      <VistaPantalla estado={estado} escala={escala} textoReposo={aj.textoReposo} />
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

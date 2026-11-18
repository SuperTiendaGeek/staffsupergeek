"use client";

// Conexión entre las ventanas del portal y la Pantalla del cliente (10E-B).
// BroadcastChannel: solo entre ventanas del mismo navegador y la misma
// computadora (la del mostrador). Nada pasa por internet.

import { useCallback, useEffect, useRef, useState } from "react";
import { CANAL_PANTALLA, pantallaConectada, type Comando, type EstadoPantalla, type Mensaje } from "@/lib/pantalla-cliente/reglas";

export function usePantallaCliente() {
  const canal = useRef<BroadcastChannel | null>(null);
  const [estado, setEstado] = useState<EstadoPantalla | null>(null);
  const [ultimoLatido, setUltimoLatido] = useState<number | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const c = new BroadcastChannel(CANAL_PANTALLA);
    canal.current = c;
    c.onmessage = (ev: MessageEvent<Mensaje>) => {
      const m = ev.data;
      if (m?.de !== "pantalla") return;
      if ("apagada" in m) { setEstado(null); setUltimoLatido(null); return; }
      setEstado(m.estado);
      setUltimoLatido(Date.now());
    };
    // ¿Hay una pantalla encendida? Ella contesta con su estado.
    c.postMessage({ de: "portal", comando: { tipo: "quien_esta" } } satisfies Mensaje);
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => { clearInterval(t); c.close(); canal.current = null; };
  }, []);

  const enviar = useCallback((comando: Comando) => {
    canal.current?.postMessage({ de: "portal", comando } satisfies Mensaje);
    // Apagar se ve al instante (la ventana confirma con "apagada").
    if (comando.tipo === "apagar") { setEstado(null); setUltimoLatido(null); }
  }, []);

  const conectada = pantallaConectada(ultimoLatido, ahora);
  return { conectada, estado: conectada ? estado : null, enviar };
}

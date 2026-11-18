"use client";

// Ajustes de la pantalla del cliente para esta persona (10E-C). Se piden una
// sola vez por página aunque varios componentes los usen.

import { useEffect, useState } from "react";

export type ConfigPantallaCliente = { permitido: boolean; segundosGracias: number; minutosSinActividad: number; textoReposo: string };

let pedido: Promise<ConfigPantallaCliente | null> | null = null;

function pedir(): Promise<ConfigPantallaCliente | null> {
  pedido ??= fetch("/api/pantalla-cliente/config", { cache: "no-store" })
    .then((r) => r.json())
    .then((j: { success: boolean; data?: ConfigPantallaCliente }) => (j.success && j.data ? j.data : null))
    .catch(() => { pedido = null; return null; });
  return pedido;
}

export function useConfigPantalla(): ConfigPantallaCliente | null {
  const [c, setC] = useState<ConfigPantallaCliente | null>(null);
  useEffect(() => { let vivo = true; void pedir().then((x) => { if (vivo) setC(x); }); return () => { vivo = false; }; }, []);
  return c;
}

/** Para la ventana del monitor: vuelve a leer los ajustes (cambian desde Administrar). */
export function olvidarConfigPantalla() { pedido = null; }

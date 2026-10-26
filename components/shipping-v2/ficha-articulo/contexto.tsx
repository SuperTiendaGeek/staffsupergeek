"use client";

// Punto 18 (25-oct-2026): contexto de la ventana única de la ficha del
// artículo (ver FichaArticuloProveedor.tsx). Aparte para que cualquier
// pantalla pueda abrir la ficha sin importar la ventana entera.

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from "react";
import type { FichaArticulo } from "@/lib/shipping-v2/ficha-articulo";

export const PARAM_FICHA = "ficha";
export const ID_REGISTRO = /^rec[A-Za-z0-9]{14}$/;

export type CambioArticulo = { id: string };

export type RespuestaFicha =
  | { ok: true; ficha: FichaArticulo }
  | { ok: false; mensaje: string; estado?: number };
export type OyenteCambio = (cambio: CambioArticulo) => void;

export type ContextoFicha = {
  abrir: (id: string) => void;
  cerrar: () => void;
  abierta: string | null;
  /** Las listas se suscriben para refrescar su fila cuando algo cambia en la ficha. */
  suscribir: (oyente: OyenteCambio) => () => void;
  avisarCambio: (cambio: CambioArticulo) => void;
  /**
   * Punto 18b (velocidad): pide la ficha por adelantado (al pasar el mouse
   * sobre una unidad o una fila). Si luego se abre, aparece al instante.
   */
  precargar: (id: string) => void;
  /** La misma ficha que usa la ventana (con lo pedido por adelantado), para otras ventanas como la de Control. */
  pedirFicha: (id: string, opciones?: { fresca?: boolean }) => Promise<RespuestaFicha>;
};

export const FichaContexto = createContext<ContextoFicha | null>(null);

/** null fuera de Shipping V2 (los enlaces se comportan como enlaces normales). */
export function useFichaArticulo() {
  return useContext(FichaContexto);
}

/** Refresca algo de la pantalla cuando cambia un artículo desde la ficha. */
export function useAlCambiarArticulo(oyente: OyenteCambio) {
  const contexto = useContext(FichaContexto);
  const ref = useRef(oyente);
  ref.current = oyente;
  useEffect(() => contexto?.suscribir((cambio) => ref.current(cambio)), [contexto]);
}

/**
 * Punto 18b (velocidad): si el mouse se queda un momento sobre algo que abre
 * una ficha, la ficha se pide por adelantado (una a la vez). Al hacer clic se
 * abre al instante. Fuera de Shipping V2 no hace nada.
 */
export function useIntencionFicha() {
  const ficha = useContext(FichaContexto);
  const espera = useRef<number | null>(null);
  const alSalir = useCallback(() => {
    if (espera.current) window.clearTimeout(espera.current);
    espera.current = null;
  }, []);
  const alEntrar = useCallback((id: string) => {
    if (!ficha || !ID_REGISTRO.test(id)) return;
    if (espera.current) window.clearTimeout(espera.current);
    espera.current = window.setTimeout(() => ficha.precargar(id), 250);
  }, [ficha]);
  useEffect(() => alSalir, [alSalir]);
  return { alEntrar, alSalir };
}

export function hrefArticulo(id: string) {
  return `/shipping-v2/items/${encodeURIComponent(id)}`;
}

/**
 * Enlace a la ficha de un artículo. Clic normal: la abre en la ventana (si se
 * está dentro de Shipping V2). Ctrl/Cmd/Shift/clic medio: comportamiento
 * normal del navegador (pestaña nueva con la página completa).
 */
export function EnlaceArticulo({
  id,
  children,
  onClick,
  ...props
}: { id: string; children: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const ficha = useFichaArticulo();
  const intencion = useIntencionFicha();
  const href = hrefArticulo(id);
  function alPulsar(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented || !ficha) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (props.target && props.target !== "_self") return;
    event.preventDefault();
    ficha.abrir(id);
  }
  return (
    // Sin precarga: en listas largas cada enlace pediría la ficha al servidor sin que nadie la abra.
    <Link
      href={href}
      prefetch={false}
      {...props}
      onClick={alPulsar}
      onMouseEnter={(event) => {
        props.onMouseEnter?.(event);
        intencion.alEntrar(id);
      }}
      onMouseLeave={(event) => {
        props.onMouseLeave?.(event);
        intencion.alSalir();
      }}
    >
      {children}
    </Link>
  );
}


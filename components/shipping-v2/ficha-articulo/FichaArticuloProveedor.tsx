"use client";

// Punto 18 (25-oct-2026): UNA sola ventana para la ficha del artículo en todo
// Shipping V2. Se abre encima de la lista que el usuario está usando (la lista
// no se desmonta: conserva filtros, búsqueda, página y posición).
//
// - La dirección suma "?ficha=<id>": recargar vuelve a abrirla encima de la
//   misma lista, y el botón Atrás del navegador la cierra.
// - La dirección directa /shipping-v2/items/<id> sigue abriendo la página
//   completa (enlaces compartidos, pestaña nueva, Ctrl+clic).
// - Los datos los entrega GET /api/shipping-v2/items/<id>/ficha, ya
//   recortados para el perfil de la sesión. Mientras llegan, solo se ve un
//   esqueleto neutro: nunca se pinta un dato que luego haya que esconder.
//
// Se descartó el modal con "Intercepting Routes" de Next.js porque atraparía
// también /shipping-v2/items/nuevo (Registrar compra).

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ExternalLink, Link2, Loader2, X } from "lucide-react";
import type { FichaArticulo } from "@/lib/shipping-v2/ficha-articulo";
import { FichaArticuloVista } from "./FichaArticuloVista";
import { FichaContexto, ID_REGISTRO, PARAM_FICHA, hrefArticulo, type CambioArticulo, type OyenteCambio } from "./contexto";

/** Registros del mismo SKU que trae la ficha (para cambiar de unidad sin recargar todo). */
function idsDelSku(ficha: FichaArticulo): string[] {
  if (ficha.perfil === "proveedor") return [];
  return ficha.datos.hermanas.map((h) => h.id);
}

// ─── Punto 18b (velocidad): fichas pedidas por adelantado ────────────────────
// Cada ficha tarda lo que tardan dos lecturas seguidas en Airtable. Para que
// cambiar de unidad (o abrir una fila) se sienta inmediato, la ficha se pide
// al pasar el mouse por encima y se guarda unos segundos SOLO en esta pestaña
// y mientras se está en Shipping V2 (al salir se olvida). Cualquier cambio
// guardado desde la ficha borra todo lo guardado.

const FICHA_GUARDADA_MS = 20 * 1000;

type RespuestaFicha =
  | { ok: true; ficha: FichaArticulo }
  | { ok: false; mensaje: string; estado?: number };

type AlmacenFichas = {
  /** Una ficha guardada hace menos de 20 s, si hay. */
  guardada: (id: string) => FichaArticulo | null;
  /** Pide la ficha (reutiliza la que ya se está pidiendo o la guardada). */
  pedir: (id: string, opciones?: { fresca?: boolean }) => Promise<RespuestaFicha>;
  olvidar: () => void;
};

function crearAlmacenFichas(): AlmacenFichas {
  const guardadas = new Map<string, { ficha: FichaArticulo; at: number }>();
  const enCurso = new Map<string, Promise<RespuestaFicha>>();
  const guardada = (id: string) => {
    const g = guardadas.get(id);
    return g && Date.now() - g.at < FICHA_GUARDADA_MS ? g.ficha : null;
  };
  const pedir = (id: string, opciones: { fresca?: boolean } = {}) => {
    if (!opciones.fresca) {
      const g = guardada(id);
      if (g) return Promise.resolve<RespuestaFicha>({ ok: true, ficha: g });
      const pendiente = enCurso.get(id);
      if (pendiente) return pendiente;
    }
    const promesa: Promise<RespuestaFicha> = fetch(`/api/shipping-v2/items/${encodeURIComponent(id)}/ficha`, { cache: "no-store" })
      .then(async (respuesta) => {
        const payload = await respuesta.json().catch(() => ({}));
        if (!respuesta.ok || !payload.success) {
          return { ok: false as const, mensaje: String(payload.error || "No se pudo cargar el artículo."), estado: respuesta.status };
        }
        const ficha = payload.data as FichaArticulo;
        guardadas.set(id, { ficha, at: Date.now() });
        if (guardadas.size > 30) guardadas.delete(guardadas.keys().next().value as string);
        return { ok: true as const, ficha };
      })
      .catch((error) => ({ ok: false as const, mensaje: error instanceof Error ? error.message : "No se pudo cargar el artículo." }))
      .finally(() => {
        if (enCurso.get(id) === promesa) enCurso.delete(id);
      });
    enCurso.set(id, promesa);
    return promesa;
  };
  return { guardada, pedir, olvidar: () => guardadas.clear() };
}

function leerParam(): string | null {
  if (typeof window === "undefined") return null;
  const valor = new URLSearchParams(window.location.search).get(PARAM_FICHA);
  return valor && ID_REGISTRO.test(valor) ? valor : null;
}

function urlCon(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set(PARAM_FICHA, id);
  else url.searchParams.delete(PARAM_FICHA);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function FichaArticuloProveedor({ children }: { children: ReactNode }) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const pathname = usePathname();
  const ultimaRuta = useRef(pathname);
  // ¿La entrada actual del historial la agregamos nosotros? (entonces Cerrar = Atrás)
  const empujada = useRef(false);
  const oyentes = useRef(new Set<OyenteCambio>());
  const [almacen] = useState(crearAlmacenFichas);

  // Al cargar (o recargar) con ?ficha=… se abre encima de la pantalla.
  useEffect(() => {
    setAbierta(leerParam());
  }, []);

  // Atrás / Adelante del navegador.
  useEffect(() => {
    const alNavegar = () => {
      const id = leerParam();
      if (!id) empujada.current = false;
      setAbierta(id);
    };
    window.addEventListener("popstate", alNavegar);
    return () => window.removeEventListener("popstate", alNavegar);
  }, []);

  // Si el usuario se va a otra pantalla (un enlace dentro de la ficha), se cierra.
  useEffect(() => {
    if (ultimaRuta.current === pathname) return;
    ultimaRuta.current = pathname;
    empujada.current = false;
    setAbierta(leerParam());
  }, [pathname]);

  const abrir = useCallback((id: string) => {
    if (!ID_REGISTRO.test(id)) return;
    if (leerParam()) {
      // Ya hay una ficha abierta: se reemplaza (Atrás sigue cerrando la ventana).
      window.history.replaceState(null, "", urlCon(id));
    } else {
      window.history.pushState(null, "", urlCon(id));
      empujada.current = true;
    }
    setAbierta(id);
  }, []);

  const cerrar = useCallback(() => {
    if (empujada.current && leerParam()) {
      empujada.current = false;
      window.history.back();
      return;
    }
    window.history.replaceState(null, "", urlCon(null));
    setAbierta(null);
  }, []);

  const suscribir = useCallback((oyente: OyenteCambio) => {
    oyentes.current.add(oyente);
    return () => {
      oyentes.current.delete(oyente);
    };
  }, []);

  const avisarCambio = useCallback((cambio: CambioArticulo) => {
    // Algo se guardó: lo pedido por adelantado puede estar viejo.
    almacen.olvidar();
    for (const oyente of oyentes.current) oyente(cambio);
  }, [almacen]);

  const precargar = useCallback((id: string) => {
    if (ID_REGISTRO.test(id)) void almacen.pedir(id);
  }, [almacen]);

  const valor = useMemo(() => ({ abrir, cerrar, abierta, suscribir, avisarCambio, precargar }), [abrir, cerrar, abierta, suscribir, avisarCambio, precargar]);

  return (
    <FichaContexto.Provider value={valor}>
      {children}
      {abierta ? <FichaArticuloVentana id={abierta} almacen={almacen} onClose={cerrar} onCambio={avisarCambio} /> : null}
    </FichaContexto.Provider>
  );
}

// ─── La ventana ──────────────────────────────────────────────────────────────

type Estado =
  | { tipo: "cargando" }
  | { tipo: "error"; mensaje: string; estado?: number }
  | { tipo: "lista"; ficha: FichaArticulo };

function EsqueletoFicha() {
  // Neutro a propósito: formas grises, ningún dato ni etiqueta de ningún perfil.
  const barra = "rounded bg-[#20211D]";
  return (
    <div className="grid w-full gap-3 p-3 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" aria-hidden="true">
      <div className={`${barra} aspect-[4/3] w-full animate-pulse`} />
      <div className="space-y-3">
        <div className="space-y-2 rounded-lg border border-[#24251F] p-3">
          <div className={`${barra} h-4 w-40 animate-pulse`} />
          <div className={`${barra} h-6 w-3/4 animate-pulse`} />
          <div className={`${barra} h-3 w-1/2 animate-pulse`} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => <div key={i} className={`${barra} h-12 animate-pulse`} />)}
        </div>
        <div className={`${barra} h-40 animate-pulse`} />
      </div>
    </div>
  );
}

function FichaArticuloVentana({ id, almacen, onClose, onCambio }: { id: string; almacen: AlmacenFichas; onClose: () => void; onCambio: (cambio: CambioArticulo) => void }) {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>({ tipo: "cargando" });
  const [version, setVersion] = useState(0);
  const [copiado, setCopiado] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const enfocadoAntes = useRef<Element | null>(null);

  // Cada artículo nuevo empieza desde el esqueleto (nunca con los datos del
  // anterior). Punto 18b: si es otra unidad del MISMO SKU, la ficha se queda y
  // solo se atenúa hasta que llega la unidad nueva; si ya se había pedido por
  // adelantado, aparece al instante.
  const estadoRef = useRef(estado);
  useEffect(() => {
    estadoRef.current = estado;
  }, [estado]);
  const [cambiandoUnidad, setCambiandoUnidad] = useState(false);
  const versionVista = useRef(version);
  useEffect(() => {
    let vivo = true;
    const fresca = versionVista.current !== version;
    versionVista.current = version;
    const lista = fresca ? null : almacen.guardada(id);
    if (lista) {
      setEstado({ tipo: "lista", ficha: lista });
      setCambiandoUnidad(false);
      return;
    }
    const actual = estadoRef.current;
    if (!fresca) {
      if (actual.tipo === "lista" && actual.ficha.datos.item.id !== id && idsDelSku(actual.ficha).includes(id)) setCambiandoUnidad(true);
      else if (!(actual.tipo === "lista" && actual.ficha.datos.item.id === id)) setEstado({ tipo: "cargando" });
    }
    void almacen.pedir(id, { fresca }).then((respuesta) => {
      if (!vivo) return;
      setEstado(respuesta.ok ? { tipo: "lista", ficha: respuesta.ficha } : { tipo: "error", mensaje: respuesta.mensaje, estado: respuesta.estado });
      setCambiandoUnidad(false);
    });
    return () => {
      vivo = false;
    };
  }, [id, version, almacen]);

  // Fondo quieto, foco dentro y Esc para cerrar (si no hay otra ventana encima).
  useEffect(() => {
    enfocadoAntes.current = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus({ preventScroll: true });
    const alTeclear = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const ventanas = Array.from(document.querySelectorAll('[aria-modal="true"], [role="dialog"]'));
      if (ventanas.length && ventanas[ventanas.length - 1] !== panelRef.current) return;
      onClose();
    };
    document.addEventListener("keydown", alTeclear);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", alTeclear);
      if (enfocadoAntes.current instanceof HTMLElement) enfocadoAntes.current.focus({ preventScroll: true });
    };
  }, [onClose]);

  const alCambiar = useCallback(() => {
    onCambio({ id });
    setVersion((v) => v + 1);
    router.refresh();
  }, [id, onCambio, router]);

  async function copiarEnlace() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${hrefArticulo(id)}`);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 1400);
    } catch {
      // Sin permiso de portapapeles: no pasa nada, el enlace de la página sigue a mano.
    }
  }

  const boton = "inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#3A3A36] bg-[#151613]/95 text-[#B4B5AC] transition hover:border-[#D7FF4F]/55 hover:text-[#D7FF4F] focus:outline-none focus:ring-2 focus:ring-[#D7FF4F]/35";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-hidden bg-black/70 px-2 py-2 animate-[sg-velo_160ms_ease-out] sm:px-4 sm:py-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Ficha del artículo"
        tabIndex={-1}
        className="relative flex max-h-full w-full max-w-[min(96vw,1440px)] flex-col overflow-hidden rounded-xl border border-[#3A3A36] bg-[#11120F] shadow-2xl shadow-black/60 outline-none animate-[sg-modal_200ms_cubic-bezier(0.2,0.8,0.2,1)]"
      >
        {/* Barra fija arriba (fuera del área que se desplaza: no tapa la barra de desplazamiento). */}
        <div className="flex h-11 shrink-0 items-center justify-end gap-1 border-b border-[#24251F] px-2">
          {cambiandoUnidad ? (
            <span className="mr-auto inline-flex items-center gap-1.5 px-1 text-[12px] text-[#8F908A]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Cargando unidad…
            </span>
          ) : null}
          <button type="button" onClick={() => void copiarEnlace()} className={boton} title={copiado ? "Enlace copiado" : "Copiar enlace del artículo"} aria-label="Copiar enlace del artículo">
            <Link2 className={`h-4 w-4 ${copiado ? "text-[#D7FF4F]" : ""}`} aria-hidden="true" />
          </button>
          <a href={hrefArticulo(id)} className={boton} title="Abrir como página" aria-label="Abrir como página">
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
          <button type="button" onClick={onClose} className={boton} title="Cerrar (Esc)" aria-label="Cerrar">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-ficha-scroll>
          {estado.tipo === "cargando" ? (
            <EsqueletoFicha />
          ) : estado.tipo === "error" ? (
            <div className="m-3 rounded-lg border border-[#FF914D]/35 bg-[#FF914D]/10 px-4 py-3 text-[13px] text-[#FFB07A]">
              {estado.mensaje}
              {estado.estado === 401 ? <> <a href="/login" className="font-semibold underline">Iniciar sesión</a></> : null}
            </div>
          ) : (
            <div aria-busy={cambiandoUnidad || undefined} className={`p-2 transition-opacity duration-150 sm:p-3 animate-[sg-entrada_180ms_ease-out] ${cambiandoUnidad ? "pointer-events-none opacity-60" : ""}`}>
              <FichaArticuloVista ficha={estado.ficha} modo="modal" alCambiar={alCambiar} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

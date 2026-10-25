"use client";

// Visor de documentos: UNA ventana flotante para factura, recibo, proforma,
// nota de crédito y reserva, en todo el portal. La pantalla de fondo (Kardex,
// ficha, Facturación) no se mueve ni pierde lo que estaba buscando.
//
//   · <DocumentoModal tipo recordId onClose /> — se abre a mano.
//   · <VisorDocumentosProvider> + useVisorDocumentos().abrir(tipo, id) — para
//     tablas con muchos enlaces (Kardex): un solo visor para toda la pantalla.
//
// Dentro del visor, un documento ligado (la factura que corrige una nota de
// crédito, la factura de una reserva) se abre encima, con "←" para volver.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, X } from "lucide-react";
import type { DocumentoVisor, TipoVisor } from "@/lib/facturacion/documentos/visor-tipos";
import { DocumentoEncabezado, DocumentoVista } from "./DocumentoVista";

type Entrada = { tipo: TipoVisor; recordId: string; numero?: string };

const cache = new Map<string, DocumentoVisor>();

export function DocumentoModal({
  tipo,
  recordId,
  numero,
  fuente = "/api/shipping-v2/documentos",
  onClose,
  resaltarSku,
  onAbrirSku,
  acciones,
}: {
  tipo: TipoVisor;
  recordId: string;
  /** Número ya conocido (se muestra mientras carga). */
  numero?: string;
  /** Ruta que entrega el documento (Shipping V2 o Facturación, según el permiso de la pantalla). */
  fuente?: string;
  onClose: () => void;
  resaltarSku?: string;
  /** Si se da, el código de cada línea abre ese artículo (y cierra el visor). */
  onAbrirSku?: (sku: string) => void;
  /** Botones propios de la pantalla (Facturación: reenviar, anular…), al pie. */
  acciones?: (doc: DocumentoVisor | null) => ReactNode;
}) {
  const [pila, setPila] = useState<Entrada[]>([{ tipo, recordId, numero }]);
  // Hacia dónde se movió el usuario: el documento ligado entra desde la derecha; al volver, desde la izquierda.
  const [sentido, setSentido] = useState<"abre" | "vuelve" | "">("");
  const actual = pila[pila.length - 1];
  const clave = `${actual.tipo}:${actual.recordId}`;
  const [doc, setDoc] = useState<DocumentoVisor | null>(cache.get(clave) ?? null);
  const [error, setError] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const abajoEnFondo = useRef(false);

  // Abrir otro documento desde fuera (mismo visor) reinicia la pila.
  useEffect(() => { setSentido(""); setPila([{ tipo, recordId, numero }]); }, [tipo, recordId, numero]);

  useEffect(() => {
    let vivo = true;
    const enCache = cache.get(clave);
    setDoc(enCache ?? null);
    setError("");
    fetch(`${fuente}/${actual.tipo}/${encodeURIComponent(actual.recordId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { success: boolean; data?: DocumentoVisor; error?: string }) => {
        if (!vivo) return;
        if (j.success && j.data) { cache.set(clave, j.data); setDoc(j.data); }
        else if (!enCache) setError(j.error || "No se pudo cargar el documento.");
      })
      .catch(() => { if (vivo && !enCache) setError("Sin conexión: no se pudo cargar el documento."); });
    return () => { vivo = false; };
  }, [clave, fuente, actual.tipo, actual.recordId]);

  // Esc cierra (o vuelve al documento anterior); el fondo no se desplaza.
  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previo?.focus?.();
    };
  }, []);
  const volver = useCallback(() => { setSentido("vuelve"); setPila((p) => (p.length > 1 ? p.slice(0, -1) : p)); }, []);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (pila.length > 1) volver();
      else onClose();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [pila.length, volver, onClose]);

  const anterior = pila.length > 1 ? pila[pila.length - 2] : null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-stretch justify-center bg-black/65 backdrop-blur-[2px] animate-[sg-velo_150ms_ease-out] sm:items-center sm:p-6 print:hidden"
      onMouseDown={(e) => { abajoEnFondo.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (abajoEnFondo.current && e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={doc ? `${doc.numero}` : "Documento"}
        className="flex h-[100dvh] w-full max-w-[920px] flex-col overflow-hidden border-[#30312D] bg-[#121310] text-[#EDEDE7] shadow-2xl shadow-black/60 outline-none animate-[sg-modal_180ms_cubic-bezier(.2,.8,.2,1)] sm:h-auto sm:max-h-[88vh] sm:rounded-2xl sm:border"
      >
        <div className="border-b border-[#30312D] bg-[#161713] px-4 py-2.5">
          <DocumentoEncabezado
            tipo={actual.tipo}
            doc={doc}
            numeroPista={actual.numero}
            antes={anterior ? (
              <button type="button" onClick={volver} title={`Volver a ${anterior.numero || "el documento anterior"}`} aria-label="Volver" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#3A3B35] text-[#C9CAC1] hover:border-[#D7FF4F]/50 hover:text-[#EDEDE7]">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
            despues={(
              <button type="button" onClick={onClose} aria-label="Cerrar (Esc)" title="Cerrar (Esc)" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#8F908A] hover:bg-white/[0.05] hover:text-[#EDEDE7]">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {doc ? (
            <div key={clave} className={sentido === "abre" ? "animate-[sg-panel_180ms_ease-out]" : sentido === "vuelve" ? "animate-[sg-regreso_180ms_ease-out]" : "animate-[sg-velo_140ms_ease-out]"}>
              <DocumentoVista
                doc={doc}
                resaltarSku={pila.length === 1 ? resaltarSku : undefined}
                onAbrirRelacionado={(t, id, n) => { setSentido("abre"); setPila((p) => [...p, { tipo: t, recordId: id, numero: n }]); }}
                onAbrirSku={onAbrirSku ? (sku) => { onClose(); onAbrirSku(sku); } : undefined}
              />
            </div>
          ) : error ? (
            <p className="rounded-lg border border-[#FF8A80]/30 bg-[#FF8A80]/[0.08] px-3 py-2 text-[12.5px] text-[#FFC2BC] animate-[sg-sacudir_300ms_ease-out]">{error}</p>
          ) : (
            // Esqueleto con la misma forma del documento: al llegar los datos no salta nada.
            <div className="space-y-2" aria-busy="true" aria-label="Cargando">
              <div className="space-y-1.5 px-0.5 py-0.5">
                <div className="h-3.5 w-3/5 animate-pulse rounded bg-white/[0.06]" />
                <div className="h-3.5 w-2/5 animate-pulse rounded bg-white/[0.05]" />
              </div>
              <div className="space-y-2.5 rounded-xl border border-[#30312D] bg-[#171814] p-3">
                <div className="h-3 w-full animate-pulse rounded bg-white/[0.05]" />
                <div className="h-3 w-11/12 animate-pulse rounded bg-white/[0.05]" />
                <div className="ml-auto h-4 w-40 animate-pulse rounded bg-white/[0.06]" />
              </div>
            </div>
          )}
        </div>

        {acciones && pila.length === 1 ? (
          <div className="border-t border-[#30312D] bg-[#161713] px-4 py-2.5">{acciones(doc)}</div>
        ) : null}
      </div>
    </div>
  );
}

// ─── Un visor para toda una pantalla ─────────────────────────────────────────

type Visor = { abrir: (tipo: TipoVisor, recordId: string, numero?: string) => void };
const VisorContexto = createContext<Visor | null>(null);

/** null si la pantalla no tiene visor (entonces se usa el enlace de siempre). */
export function useVisorDocumentos(): Visor | null {
  return useContext(VisorContexto);
}

export function VisorDocumentosProvider({ children, fuente, resaltarSku, onAbrirSku }: {
  children: ReactNode;
  fuente?: string;
  resaltarSku?: string;
  onAbrirSku?: (sku: string) => void;
}) {
  const [abierto, setAbierto] = useState<Entrada | null>(null);
  const valor = useMemo<Visor>(() => ({ abrir: (tipo, recordId, numero) => setAbierto({ tipo, recordId, numero }) }), []);
  return (
    <VisorContexto.Provider value={valor}>
      {children}
      {abierto ? (
        <DocumentoModal
          tipo={abierto.tipo}
          recordId={abierto.recordId}
          numero={abierto.numero}
          fuente={fuente}
          resaltarSku={resaltarSku}
          onAbrirSku={onAbrirSku}
          onClose={() => setAbierto(null)}
        />
      ) : null}
    </VisorContexto.Provider>
  );
}

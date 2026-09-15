"use client";

// Visor de evidencias de una novedad: tira de miniaturas + lightbox que sabe
// mostrar fotos Y videos, con subida desde el celular o el escritorio.
//
// Por qué no se reusó `ItemPhotoViewer`: aquel es un carrusel de UNA foto
// grande con su marco, atado al endpoint de fotos de Items, solo imágenes y
// con cuatro modos de densidad. Aquí hace falta lo contrario — varias
// miniaturas pequeñas dentro de una tarjeta ya densa — y además video, que
// aquel no contempla. Adaptarlo habría tocado dos pantallas en producción
// (recepción y detalle de packing) para ganar poco. A futuro lo razonable es
// que `ItemPhotoViewer` pase a usar ESTE lightbox, no al revés.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ShippingV2Attachment } from "@/types/shipping-v2";
import {
  ACCEPT_EVIDENCIAS,
  MAX_EVIDENCIAS_POR_NOVEDAD,
  clasificarEvidencia,
  esFotoPrevisualizable,
  etiquetaEvidencia,
  resolverTipoEvidencia,
  urlMiniaturaEvidencia,
} from "@/lib/shipping-v2/evidencias";
import { EvidenciasInvalidasError, subirEvidenciasNovedad } from "@/lib/shipping-v2/subir-evidencias";

type Props = {
  novedadId: string;
  evidencias: ShippingV2Attachment[];
  /** Devuelve la novedad ya actualizada por el servidor. */
  onUpdated?: (novedad: unknown) => void;
  canEdit?: boolean;
  /** `compacta` = tira de miniaturas chicas para una tarjeta. */
  variante?: "compacta" | "normal";
};

function claveEvidencia(evidencia: ShippingV2Attachment, indice: number) {
  return evidencia.id || evidencia.url || `${evidencia.filename || "evidencia"}-${indice}`;
}

export function VisorEvidencias({
  novedadId,
  evidencias,
  onUpdated,
  canEdit = true,
  variante = "compacta",
}: Props) {
  const [indice, setIndice] = useState(0);
  const [abierto, setAbierto] = useState(false);
  const [montado, setMontado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const actual = evidencias[indice] || null;
  const lleno = evidencias.length >= MAX_EVIDENCIAS_POR_NOVEDAD;
  const miniatura = variante === "compacta" ? "h-14 w-14" : "h-20 w-20";

  useEffect(() => setMontado(true), []);

  // Si se borra la última, el índice queda fuera de rango.
  useEffect(() => {
    setIndice((actualIndice) => (evidencias.length === 0 ? 0 : Math.min(actualIndice, evidencias.length - 1)));
  }, [evidencias.length]);

  useEffect(() => {
    if (!abierto) return;

    function alTeclear(evento: KeyboardEvent) {
      if (evento.key === "Escape") setAbierto(false);
      if (evento.key === "ArrowLeft") mover(-1);
      if (evento.key === "ArrowRight") mover(1);
    }

    document.addEventListener("keydown", alTeclear);
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", alTeclear);
      document.body.style.overflow = overflowPrevio;
    };
  }, [abierto, evidencias.length]);

  function mover(direccion: -1 | 1) {
    if (!evidencias.length) return;
    setIndice((i) => (i + direccion + evidencias.length) % evidencias.length);
  }

  function abrirEn(i: number) {
    setIndice(i);
    setConfirmarBorrado(false);
    setAbierto(true);
  }

  async function subir(archivos: File[]) {
    setOcupado(true);
    setError("");
    try {
      // Valida, comprime las fotos y sube archivo por archivo. Lo que sí subió
      // queda guardado aunque otro falle.
      const resultado = await subirEvidenciasNovedad(novedadId, archivos, {
        yaSubidas: evidencias.length,
      });
      if (resultado.aviso) setError(resultado.aviso);
      if (resultado.novedad) onUpdated?.(resultado.novedad);
    } catch (errorSubida) {
      setError(
        errorSubida instanceof EvidenciasInvalidasError
          ? errorSubida.message
          : errorSubida instanceof Error
            ? errorSubida.message
            : "Error inesperado"
      );
    } finally {
      setOcupado(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function eliminarActual() {
    if (!actual) return;
    setOcupado(true);
    setError("");
    try {
      const respuesta = await fetch(`/api/shipping-v2/novedades/${novedadId}/evidencias`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attachmentId: actual.id, url: actual.url, filename: actual.filename }),
      });
      const payload = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok || !payload.success) {
        throw new Error(String(payload.error || "No se pudo eliminar la evidencia."));
      }
      setConfirmarBorrado(false);
      if (evidencias.length <= 1) setAbierto(false);
      onUpdated?.(payload.data);
    } catch (errorBorrado) {
      setError(errorBorrado instanceof Error ? errorBorrado.message : "Error inesperado");
    } finally {
      setOcupado(false);
    }
  }

  // `montado` evita llamar a createPortal durante el render del servidor,
  // donde no existe `document`.
  const lightbox = montado && abierto && actual ? createPortal(
    <div className="fixed inset-0 z-[1100] flex flex-col bg-black/95 p-4 backdrop-blur-md">
      <div className="flex items-center justify-between gap-3">
        <span className="truncate rounded-full border border-[#3A3A36] bg-[#151515]/80 px-3 py-1 text-xs font-semibold text-[#F5F5F5]">
          {indice + 1} / {evidencias.length} · {etiquetaEvidencia(actual, indice)}
        </span>
        <div className="flex items-center gap-2">
          {canEdit ? (
            confirmarBorrado ? (
              <>
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => void eliminarActual()}
                  className="h-9 rounded-full border border-[#FF6B6B] bg-[#FF6B6B]/15 px-3 text-xs font-bold text-[#FF9C9C] transition hover:bg-[#FF6B6B]/25 disabled:opacity-40"
                >
                  Sí, eliminar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmarBorrado(false)}
                  className="h-9 rounded-full border border-[#3A3A36] bg-[#151515]/80 px-3 text-xs font-semibold text-[#A7A7A7]"
                >
                  Cancelar
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmarBorrado(true)}
                className="h-9 rounded-full border border-[#3A3A36] bg-[#151515]/80 px-3 text-xs font-semibold text-[#A7A7A7] transition hover:border-[#FF6B6B] hover:text-[#FF9C9C]"
              >
                Eliminar
              </button>
            )
          ) : null}
          <a
            href={actual.url}
            target="_blank"
            rel="noopener noreferrer"
            className="grid h-10 place-items-center rounded-full border border-[#3A3A36] bg-[#151515]/80 px-3 text-xs font-semibold text-[#F5F5F5] transition hover:border-[#D7FF4F] hover:text-[#D7FF4F]"
          >
            Abrir original
          </a>
          <button
            type="button"
            onClick={() => setAbierto(false)}
            className="grid h-10 w-10 place-items-center rounded-full border border-[#3A3A36] bg-[#151515]/80 text-xl text-[#F5F5F5] transition hover:border-[#D7FF4F] hover:text-[#D7FF4F]"
            aria-label="Cerrar visor"
          >
            ×
          </button>
        </div>
      </div>

      <div className="relative mt-4 flex min-h-0 flex-1 items-center justify-center">
        {evidencias.length > 1 ? (
          <button type="button" onClick={() => mover(-1)} className="absolute left-0 z-10 grid h-11 w-11 place-items-center rounded-full border border-[#3A3A36] bg-[#151515]/75 text-2xl text-[#F5F5F5] transition hover:border-[#D7FF4F] hover:text-[#D7FF4F]">‹</button>
        ) : null}

        {clasificarEvidencia(actual) === "video" ? (
          <video
            key={actual.url}
            src={actual.url}
            controls
            playsInline
            className="max-h-full max-w-full rounded-lg"
          />
        ) : esFotoPrevisualizable(actual) ? (
          <img src={actual.url} alt={etiquetaEvidencia(actual, indice)} className="max-h-full max-w-full object-contain" />
        ) : (
          // HEIC del iPhone y compañía: el archivo está guardado, pero el
          // navegador no lo sabe dibujar. Se dice claro en vez de mostrar el
          // ícono de imagen rota.
          <div className="max-w-md rounded-xl border border-[#3A3A36] bg-[#171814] p-6 text-center">
            <p className="text-sm font-semibold text-[#F5F5F5]">{etiquetaEvidencia(actual, indice)}</p>
            <p className="mt-2 text-xs leading-5 text-[#A7A7A7]">
              Este formato ({resolverTipoEvidencia(actual) || "desconocido"}) no se puede ver dentro del portal.
              El archivo está guardado: ábrelo con “Abrir original”.
            </p>
          </div>
        )}

        {evidencias.length > 1 ? (
          <button type="button" onClick={() => mover(1)} className="absolute right-0 z-10 grid h-11 w-11 place-items-center rounded-full border border-[#3A3A36] bg-[#151515]/75 text-2xl text-[#F5F5F5] transition hover:border-[#D7FF4F] hover:text-[#D7FF4F]">›</button>
        ) : null}
      </div>

      {evidencias.length > 1 ? (
        <div className="mt-3 flex shrink-0 justify-center gap-2 overflow-x-auto pb-1">
          {evidencias.map((evidencia, i) => (
            <button
              key={claveEvidencia(evidencia, i)}
              type="button"
              onClick={() => { setIndice(i); setConfirmarBorrado(false); }}
              className={`h-12 w-14 shrink-0 overflow-hidden rounded-lg border transition ${i === indice ? "border-[#D7FF4F]" : "border-[#3A3A36] opacity-60 hover:opacity-100"}`}
            >
              <Miniatura evidencia={evidencia} indice={i} />
            </button>
          ))}
        </div>
      ) : null}
    </div>,
    document.body
  ) : null;

  return (
    <div className={variante === "compacta" ? "mt-1.5" : "mt-2"}>
      <div className="flex flex-wrap items-center gap-1.5">
        {evidencias.map((evidencia, i) => (
          <button
            key={claveEvidencia(evidencia, i)}
            type="button"
            onClick={() => abrirEn(i)}
            title={etiquetaEvidencia(evidencia, i)}
            className={`${miniatura} group relative shrink-0 overflow-hidden rounded-lg border border-[#3A3A36] bg-[#101010] transition hover:border-[#D7FF4F]/70`}
          >
            <Miniatura evidencia={evidencia} indice={i} />
          </button>
        ))}

        {canEdit ? (
          <>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT_EVIDENCIAS}
              multiple
              className="hidden"
              onChange={(evento) => {
                const archivos = Array.from(evento.target.files || []);
                if (archivos.length) void subir(archivos);
              }}
            />
            <button
              type="button"
              disabled={ocupado || lleno}
              onClick={() => inputRef.current?.click()}
              title={lleno ? `Máximo ${MAX_EVIDENCIAS_POR_NOVEDAD} evidencias` : "Agregar foto o video"}
              className={`${miniatura} grid shrink-0 place-items-center rounded-lg border border-dashed border-[#3A3A36] text-[#6F706B] transition hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F] disabled:opacity-35`}
            >
              {ocupado ? (
                <span className="text-[10px] font-semibold">Subiendo…</span>
              ) : (
                <span className="text-center text-[10px] font-semibold leading-tight">＋<br />Foto<br />/ video</span>
              )}
            </button>
          </>
        ) : null}

        {!evidencias.length && !canEdit ? (
          <span className="text-[11px] text-[#6F706B]">Sin evidencias</span>
        ) : null}
      </div>

      {error ? <p className="mt-1 text-[11px] text-[#FF9C9C]">{error}</p> : null}
      {lightbox}
    </div>
  );
}

/** Miniatura: foto real cuando se puede, marco con ▶ para video. */
function Miniatura({ evidencia, indice }: { evidencia: ShippingV2Attachment; indice: number }) {
  const clase = clasificarEvidencia(evidencia);
  const url = urlMiniaturaEvidencia(evidencia);

  if (clase === "video") {
    return (
      <span className="grid h-full w-full place-items-center bg-[#0C0C0C] text-[#D7FF4F]">
        <span className="text-base leading-none">▶</span>
      </span>
    );
  }

  if (!url) {
    // Formato que el navegador no dibuja (HEIC del iPhone, o algún adjunto
    // viejo que no es imagen). Se rotula con lo que realmente es, no con una
    // suposición.
    const tipo = resolverTipoEvidencia(evidencia);
    const rotulo = tipo ? tipo.split("/")[1]?.toUpperCase() || "ARCHIVO" : "ARCHIVO";
    return (
      <span className="grid h-full w-full place-items-center bg-[#0C0C0C] px-1 text-center text-[9px] font-semibold leading-tight text-[#8F908A]">
        {rotulo}
      </span>
    );
  }

  return (
    <img
      src={url}
      alt={etiquetaEvidencia(evidencia, indice)}
      loading="lazy"
      className="h-full w-full object-cover"
    />
  );
}

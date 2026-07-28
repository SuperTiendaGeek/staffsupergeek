"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ShippingV2Attachment, ShippingV2Item } from "@/types/shipping-v2";

type Props = {
  itemId: string;
  itemName: string;
  fotos: ShippingV2Attachment[];
  onUpdated: (item: ShippingV2Item) => void;
  canEdit?: boolean;
  density?: "default" | "compact" | "immersive" | "thumbnail";
};

const MAX_FOTOS_PER_ITEM = 10;
const MAX_FOTO_SIZE = 10 * 1024 * 1024;
const ALLOWED_FOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function displayName(value?: string | null) {
  const clean = value?.trim();
  return clean || "Item";
}

function photoKey(photo: ShippingV2Attachment) {
  return photo.id || photo.url || photo.filename || "foto";
}

export function ItemPhotoViewer({ itemId, itemName, fotos, onUpdated, canEdit = true, density = "default" }: Props) {
  const [index, setIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const current = fotos[index] || null;
  const hasFotos = fotos.length > 0;
  const initials = displayName(itemName).slice(0, 2).toUpperCase();
  const frameSize = density === "immersive"
    ? "min-h-[420px] h-[calc(100vh-17rem)] max-h-[820px]"
    : density === "thumbnail"
      ? "h-28 w-28"
    : density === "compact"
      ? "h-56 min-h-56"
      : "h-72 min-h-72";
  const placeholderSize = density === "immersive"
    ? "h-28 w-28 text-4xl"
    : density === "thumbnail"
      ? "h-12 w-12 text-lg"
    : density === "compact"
      ? "h-16 w-16 text-2xl"
      : "h-24 w-24 text-3xl";
  const thumbnailSize = density === "immersive" ? "h-20 w-24" : density === "thumbnail" ? "h-10 w-12" : "h-16 w-20";
  const rootSpacing = density === "thumbnail" ? "h-28 w-28 shrink-0" : "space-y-3";
  const controlsClass = density === "thumbnail"
    ? "bottom-2 right-2 gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
    : "right-3 top-3 gap-2 opacity-100 md:opacity-80 md:group-hover:opacity-100";
  const floatingButtonSize = density === "thumbnail" ? "h-7 w-7 text-[10px]" : "h-9 w-9";
  const addButtonTextSize = density === "thumbnail" ? "text-sm" : "text-lg";
  const floatingButtonClass = density === "thumbnail"
    ? "border-white/25 bg-black/30 text-white/90 shadow-lg shadow-black/30 hover:border-[#D7FF4F]/65 hover:bg-black/65 hover:text-[#D7FF4F]"
    : "border-[#3A3A36] bg-black/60 text-[#F5F5F5] hover:border-[#D7FF4F] hover:text-[#D7FF4F]";
  const imageFit = density === "thumbnail" ? "object-cover" : "object-contain";

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setIndex((currentIndex) => {
      if (fotos.length === 0) return 0;
      return Math.min(currentIndex, fotos.length - 1);
    });
  }, [fotos.length]);

  useEffect(() => {
    if (!lightboxOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setLightboxOpen(false);
      if (event.key === "ArrowLeft") move(-1);
      if (event.key === "ArrowRight") move(1);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [lightboxOpen, fotos.length]);

  useEffect(() => {
    if (!lightboxOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [lightboxOpen]);

  function move(direction: -1 | 1) {
    if (!fotos.length) return;
    setIndex((currentIndex) => (currentIndex + direction + fotos.length) % fotos.length);
  }

  function validateFiles(files: File[]) {
    if (!files.length) return "Selecciona al menos una foto.";
    if (fotos.length + files.length > MAX_FOTOS_PER_ITEM) {
      return `El Item puede tener máximo ${MAX_FOTOS_PER_ITEM} fotos.`;
    }
    if (files.some((file) => !ALLOWED_FOTO_TYPES.has(file.type))) {
      return "Las fotos deben ser JPEG, PNG o WebP.";
    }
    if (files.some((file) => file.size > MAX_FOTO_SIZE)) {
      return "Cada foto debe pesar máximo 10 MB.";
    }
    return "";
  }

  async function uploadFiles(files: File[]) {
    const validationError = validateFiles(files);
    if (validationError) {
      setError(validationError);
      return;
    }

    setBusy(true);
    setError("");
    try {
      const formData = new FormData();
      files.forEach((file) => formData.append("fotos", file));
      const response = await fetch(`/api/shipping-v2/items/${itemId}/photos`, {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(String(payload.error || "No se pudieron agregar las fotos."));
      }
      onUpdated(payload.data as ShippingV2Item);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Error inesperado");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function deleteCurrentPhoto() {
    if (!current) return;

    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/shipping-v2/items/${itemId}/photos`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attachmentId: current.id,
          url: current.url,
          filename: current.filename,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(String(payload.error || "No se pudo eliminar la foto."));
      }
      setConfirmDelete(false);
      setLightboxOpen(false);
      onUpdated(payload.data as ShippingV2Item);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Error inesperado");
    } finally {
      setBusy(false);
    }
  }

  const lightbox = lightboxOpen && hasFotos && current ? (
    <div className="fixed inset-0 z-[1000] flex flex-col bg-black/95 p-4 backdrop-blur-md">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full border border-[#3A3A36] bg-[#151515]/80 px-3 py-1 text-xs font-semibold text-[#F5F5F5]">
          {index + 1} / {fotos.length}
        </span>
        <button
          type="button"
          onClick={() => setLightboxOpen(false)}
          className="grid h-10 w-10 place-items-center rounded-full border border-[#3A3A36] bg-[#151515]/80 text-xl text-[#F5F5F5] transition hover:border-[#D7FF4F] hover:text-[#D7FF4F]"
          aria-label="Cerrar visor"
        >
          ×
        </button>
      </div>
      <div className="relative mt-4 flex min-h-0 flex-1 items-center justify-center">
        {fotos.length > 1 ? (
          <button type="button" onClick={() => move(-1)} className="absolute left-0 z-10 grid h-11 w-11 place-items-center rounded-full border border-[#3A3A36] bg-[#151515]/75 text-2xl text-[#F5F5F5] transition hover:border-[#D7FF4F] hover:text-[#D7FF4F]">‹</button>
        ) : null}
        <img src={current.url} alt={current.filename || displayName(itemName)} className="max-h-full max-w-full object-contain" />
        {fotos.length > 1 ? (
          <button type="button" onClick={() => move(1)} className="absolute right-0 z-10 grid h-11 w-11 place-items-center rounded-full border border-[#3A3A36] bg-[#151515]/75 text-2xl text-[#F5F5F5] transition hover:border-[#D7FF4F] hover:text-[#D7FF4F]">›</button>
        ) : null}
      </div>
      {fotos.length > 1 ? (
        <div className="mt-4 flex justify-center gap-2 overflow-x-auto pb-1">
          {fotos.map((photo, photoIndex) => (
            <button
              key={`lightbox-${photoKey(photo)}`}
              type="button"
              onClick={() => setIndex(photoIndex)}
              className={`h-14 w-16 shrink-0 overflow-hidden rounded-xl border transition ${photoIndex === index ? "border-[#D7FF4F]" : "border-[#3A3A36]"}`}
            >
              <img src={photo.thumbnailUrl || photo.url} alt={photo.filename || "Foto"} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  ) : null;

  return (
    <section className={rootSpacing}>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(event) => void uploadFiles(Array.from(event.target.files ?? []))}
      />

      <div className={`group relative ${frameSize} overflow-hidden rounded-xl border border-[#3A3A36] bg-[#151515] shadow-lg shadow-black/10`}>
        {hasFotos && current ? (
          density === "thumbnail" ? (
            <div className="h-full w-full bg-black">
              <img
                src={current.url}
                alt={current.filename || displayName(itemName)}
                className={`h-full w-full ${imageFit}`}
                loading="lazy"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setLightboxOpen(true)}
              className="block h-full w-full bg-black"
              aria-label="Ver foto en grande"
            >
              <img
                src={current.url}
                alt={current.filename || displayName(itemName)}
                className={`h-full w-full ${imageFit}`}
                loading="lazy"
              />
            </button>
          )
        ) : (
          <div className="grid h-full place-items-center bg-[#1E1F1C]">
            <div className="text-center">
              <div className={`mx-auto grid ${placeholderSize} place-items-center rounded-full border border-[#D7FF4F]/35 bg-[#D7FF4F]/10 font-black text-[#D7FF4F]`}>
                {initials}
              </div>
              <p className={`${density === "thumbnail" ? "mt-2 text-[11px]" : "mt-4 text-sm"} font-medium text-[#A7A7A7]`}>Sin fotos disponibles</p>
            </div>
          </div>
        )}

        {density !== "thumbnail" ? (
          <div className="absolute left-3 top-3 rounded-full border border-[#3A3A36] bg-black/55 px-3 py-1 text-xs font-semibold text-[#F5F5F5] backdrop-blur">
            {hasFotos ? `${index + 1} / ${fotos.length}` : "0 / 0"}
          </div>
        ) : null}

        <div className={`absolute ${controlsClass} flex transition`}>
          {canEdit ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className={`grid ${floatingButtonSize} place-items-center rounded-full border border-[#D7FF4F]/45 bg-black/60 ${addButtonTextSize} font-semibold text-[#D7FF4F] backdrop-blur transition hover:bg-[#D7FF4F] hover:text-[#151515] disabled:cursor-wait disabled:opacity-50`}
              title="Agregar foto"
              aria-label="Agregar foto"
            >
              +
            </button>
          ) : null}
          {hasFotos ? (
            <button
              type="button"
              onClick={() => setLightboxOpen(true)}
              className={`grid ${floatingButtonSize} place-items-center rounded-full border font-bold backdrop-blur transition ${floatingButtonClass}`}
              title="Ver grande"
              aria-label="Ver foto en grande"
            >
              ⤢
            </button>
          ) : null}
          {canEdit && hasFotos ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
              className={`grid ${floatingButtonSize} place-items-center rounded-full border border-[#FF914D]/45 bg-black/60 text-sm font-bold text-[#FFB07A] backdrop-blur transition hover:bg-[#FF914D] hover:text-[#151515] disabled:cursor-wait disabled:opacity-50`}
              title="Eliminar foto"
              aria-label="Eliminar foto"
            >
              ×
            </button>
          ) : null}
        </div>

        {fotos.length > 1 && density === "thumbnail" ? (
          <div className="pointer-events-none absolute inset-y-0 left-1 right-1 flex items-center justify-between opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
            <button type="button" onClick={(event) => { event.stopPropagation(); move(-1); }} className="pointer-events-auto grid h-7 w-7 place-items-center rounded-full border border-white/20 bg-black/25 text-lg leading-none text-white/90 backdrop-blur transition hover:border-[#D7FF4F]/65 hover:bg-black/65 hover:text-[#D7FF4F]" aria-label="Foto anterior">‹</button>
            <button type="button" onClick={(event) => { event.stopPropagation(); move(1); }} className="pointer-events-auto grid h-7 w-7 place-items-center rounded-full border border-white/20 bg-black/25 text-lg leading-none text-white/90 backdrop-blur transition hover:border-[#D7FF4F]/65 hover:bg-black/65 hover:text-[#D7FF4F]" aria-label="Foto siguiente">›</button>
          </div>
        ) : null}

        {fotos.length > 1 && density !== "thumbnail" ? (
          <div className="absolute bottom-3 right-3 flex gap-2">
            <button type="button" onClick={() => move(-1)} className="grid h-9 w-9 place-items-center rounded-full border border-[#3A3A36] bg-black/60 text-[#F5F5F5] backdrop-blur transition hover:border-[#D7FF4F] hover:text-[#D7FF4F]">‹</button>
            <button type="button" onClick={() => move(1)} className="grid h-9 w-9 place-items-center rounded-full border border-[#3A3A36] bg-black/60 text-[#F5F5F5] backdrop-blur transition hover:border-[#D7FF4F] hover:text-[#D7FF4F]">›</button>
          </div>
        ) : null}

        {confirmDelete ? (
          <div className="absolute inset-x-3 bottom-3 rounded-[1.1rem] border border-[#FF914D]/35 bg-[#151515]/95 p-3 shadow-xl shadow-black/40 backdrop-blur">
            <p className="text-sm font-medium text-[#F5F5F5]">¿Eliminar esta foto del Item?</p>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" disabled={busy} onClick={() => setConfirmDelete(false)} className="rounded-full border border-[#3A3A36] px-3 py-1.5 text-xs font-semibold text-[#F5F5F5] transition hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F] disabled:opacity-50">
                Cancelar
              </button>
              <button type="button" disabled={busy} onClick={() => void deleteCurrentPhoto()} className="rounded-full border border-[#FF914D]/50 bg-[#FF914D]/15 px-3 py-1.5 text-xs font-semibold text-[#FFB07A] transition hover:bg-[#FF914D] hover:text-[#151515] disabled:cursor-wait disabled:opacity-50">
                {busy ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {fotos.length > 1 && density !== "thumbnail" ? (
        <div className="flex snap-x gap-2 overflow-x-auto pb-1">
          {fotos.map((photo, photoIndex) => (
            <button
              key={photoKey(photo)}
              type="button"
              onClick={() => setIndex(photoIndex)}
              className={`${thumbnailSize} shrink-0 snap-start overflow-hidden rounded-xl border transition ${photoIndex === index ? "border-[#D7FF4F]" : "border-[#3A3A36]"}`}
            >
              <img src={photo.thumbnailUrl || photo.url} alt={photo.filename || "Foto"} className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      ) : null}

      {error ? (
        <p className="rounded-[1rem] border border-[#FF914D]/35 bg-[#FF914D]/10 px-3 py-2 text-sm text-[#FFB07A]">
          {error}
        </p>
      ) : null}

      {mounted && lightbox ? createPortal(lightbox, document.body) : null}
    </section>
  );
}

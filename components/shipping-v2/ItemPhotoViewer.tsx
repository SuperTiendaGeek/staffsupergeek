"use client";

import { useEffect, useRef, useState } from "react";
import type { ShippingV2Attachment, ShippingV2Item } from "@/types/shipping-v2";

type Props = {
  itemId: string;
  itemName: string;
  fotos: ShippingV2Attachment[];
  onUpdated: (item: ShippingV2Item) => void;
  canEdit?: boolean;
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

export function ItemPhotoViewer({ itemId, itemName, fotos, onUpdated, canEdit = true }: Props) {
  const [index, setIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const current = fotos[index] || null;
  const hasFotos = fotos.length > 0;
  const initials = displayName(itemName).slice(0, 2).toUpperCase();

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

  return (
    <section className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(event) => void uploadFiles(Array.from(event.target.files ?? []))}
      />

      <div className="group relative min-h-72 overflow-hidden rounded-[1.5rem] border border-[#3A3A36] bg-[#151515]">
        {hasFotos && current ? (
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            className="block h-full min-h-72 w-full bg-black"
            aria-label="Ver foto en grande"
          >
            <img
              src={current.url}
              alt={current.filename || displayName(itemName)}
              className="h-72 w-full object-contain"
              loading="lazy"
            />
          </button>
        ) : (
          <div className="grid h-full min-h-72 place-items-center bg-[#1E1F1C]">
            <div className="text-center">
              <div className="mx-auto grid h-24 w-24 place-items-center rounded-full border border-[#D7FF4F]/35 bg-[#D7FF4F]/10 text-3xl font-black text-[#D7FF4F]">
                {initials}
              </div>
              <p className="mt-4 text-sm font-medium text-[#A7A7A7]">Sin fotos disponibles</p>
            </div>
          </div>
        )}

        <div className="absolute left-3 top-3 rounded-full border border-[#3A3A36] bg-black/55 px-3 py-1 text-xs font-semibold text-[#F5F5F5] backdrop-blur">
          {hasFotos ? `${index + 1} / ${fotos.length}` : "0 / 0"}
        </div>

        <div className="absolute right-3 top-3 flex gap-2 opacity-100 transition md:opacity-80 md:group-hover:opacity-100">
          {canEdit ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="grid h-9 w-9 place-items-center rounded-full border border-[#D7FF4F]/45 bg-black/60 text-lg font-semibold text-[#D7FF4F] backdrop-blur transition hover:bg-[#D7FF4F] hover:text-[#151515] disabled:cursor-wait disabled:opacity-50"
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
              className="grid h-9 w-9 place-items-center rounded-full border border-[#3A3A36] bg-black/60 text-xs font-bold text-[#F5F5F5] backdrop-blur transition hover:border-[#D7FF4F] hover:text-[#D7FF4F]"
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
              className="grid h-9 w-9 place-items-center rounded-full border border-[#FF914D]/45 bg-black/60 text-sm font-bold text-[#FFB07A] backdrop-blur transition hover:bg-[#FF914D] hover:text-[#151515] disabled:cursor-wait disabled:opacity-50"
              title="Eliminar foto"
              aria-label="Eliminar foto"
            >
              ×
            </button>
          ) : null}
        </div>

        {fotos.length > 1 ? (
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

      {fotos.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {fotos.map((photo, photoIndex) => (
            <button
              key={photoKey(photo)}
              type="button"
              onClick={() => setIndex(photoIndex)}
              className={`h-16 w-20 shrink-0 overflow-hidden rounded-xl border transition ${photoIndex === index ? "border-[#D7FF4F]" : "border-[#3A3A36]"}`}
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

      {lightboxOpen && hasFotos && current ? (
        <div className="fixed inset-0 z-[70] flex flex-col bg-black/90 p-4 backdrop-blur-md">
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
      ) : null}
    </section>
  );
}

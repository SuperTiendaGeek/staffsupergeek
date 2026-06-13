"use client";

import { ChangeEvent, useRef, useState } from "react";
import type { AirtableAttachment } from "@/types/tecnicos";

type Props = {
  ordenId: string;
  documentos: AirtableAttachment[];
  onOrdenUpdated: (orden: unknown) => void;
};

type ApiResponse = {
  success?: boolean;
  data?: unknown;
  error?: string;
  warning?: string | null;
};

function getExtension(documento: AirtableAttachment) {
  const filename = documento.filename || "";
  const extension = filename.includes(".") ? filename.split(".").pop()?.toUpperCase() : "";

  if (extension) {
    return extension;
  }

  return documento.contentType?.split("/").pop()?.toUpperCase() || "ARCHIVO";
}

function isImageAttachment(documento: AirtableAttachment) {
  const contentType = documento.contentType?.toLowerCase() || "";
  const extension = getExtension(documento).toLowerCase();

  return contentType.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "heic", "heif"].includes(extension);
}

async function parseApiResponseSafely(response: Response): Promise<ApiResponse | null> {
  try {
    return (await response.json()) as ApiResponse;
  } catch {
    return null;
  }
}

export function OrdenDocumentosCard({ ordenId, documentos, onOrdenUpdated }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (!files.length || uploading) {
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      files.forEach((file) => formData.append("documentos", file));

      const response = await fetch(`/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/documentos`, {
        method: "POST",
        body: formData,
      });
      const payload = await parseApiResponseSafely(response);

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error?.trim() || "No se pudieron subir los documentos.");
      }

      onOrdenUpdated(payload.data);
      if (typeof payload.warning === "string" && payload.warning.trim()) {
        setError(payload.warning);
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Error desconocido");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (documento: AirtableAttachment) => {
    if (!documento.id || deletingId) {
      setError("No se pudo identificar el documento para eliminarlo.");
      return;
    }

    const filename = documento.filename || "este documento";
    if (!window.confirm(`¿Eliminar ${filename} de la orden?`)) {
      return;
    }

    setDeletingId(documento.id);
    setError(null);

    try {
      const response = await fetch(
        `/api/tecnicos/ordenes/${encodeURIComponent(ordenId)}/documentos?attachmentId=${encodeURIComponent(documento.id)}`,
        { method: "DELETE" }
      );
      const payload = await parseApiResponseSafely(response);

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error?.trim() || "No se pudo eliminar el documento.");
      }

      onOrdenUpdated(payload.data);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Error desconocido");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="rounded-[var(--sg-radius-md)] border border-[var(--sg-border)] bg-[var(--sg-card)] px-4 py-4 shadow-[var(--sg-shadow-card)]">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-extrabold uppercase leading-tight tracking-wide text-[var(--sg-text-primary)]">
          Archivos
        </h3>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-[var(--sg-radius-sm)] border border-[var(--sg-lime)] bg-[var(--sg-lime)] px-3 text-[11px] font-bold text-[var(--sg-text-on-accent)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span aria-hidden="true">+</span>
          {uploading ? "Subiendo" : "Subir archivo"}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="sr-only"
          onChange={handleUpload}
          disabled={uploading}
        />
      </div>

      {error ? (
        <p className="mt-3 rounded-[var(--sg-radius-sm)] border border-[var(--sg-danger)] bg-[var(--sg-danger-soft)] px-2.5 py-1.5 text-[11px] text-[var(--sg-danger)]">
          {error}
        </p>
      ) : null}

      <div className="mt-3">
        {documentos.length ? (
          <div className="flex flex-wrap gap-2">
            {documentos.map((documento, index) => {
              const filename = documento.filename || `Documento ${index + 1}`;
              const extension = getExtension(documento);
              const isImage = isImageAttachment(documento);
              const isDeleting = deletingId === documento.id;

              return (
                <div
                  key={documento.id ?? `${documento.url}-${index}`}
                  className="group relative h-20 w-20 overflow-hidden rounded-[var(--sg-radius-sm)] border border-[var(--sg-border)] bg-[var(--sg-panel)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-[var(--sg-lime)]"
                  title={filename}
                >
                  {isImage ? (
                    <img
                      src={documento.thumbnailUrl || documento.url}
                      alt={filename}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-[var(--sg-card-elevated)] text-[var(--sg-text-secondary)]">
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none">
                        <path
                          d="M7 3.75h6.5L18 8.25v12H7z"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinejoin="round"
                        />
                        <path d="M13.5 3.75v4.5H18" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                      </svg>
                      <span className="max-w-[4rem] truncate rounded bg-black/25 px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide text-[var(--sg-text-primary)]">
                        {extension}
                      </span>
                    </div>
                  )}

                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/65 px-1 py-1 opacity-100 backdrop-blur-sm transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                    <a
                      href={documento.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-6 w-6 items-center justify-center rounded border border-white/10 bg-white/10 text-white transition hover:border-[var(--sg-lime)] hover:text-[var(--sg-lime)]"
                      aria-label={`Abrir ${filename}`}
                      title="Abrir"
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none">
                        <path d="M8 12h8m0 0-3-3m3 3-3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M5 5h14v14H5z" stroke="currentColor" strokeWidth="1.6" />
                      </svg>
                    </a>
                    <button
                      type="button"
                      onClick={() => void handleDelete(documento)}
                      disabled={isDeleting || !documento.id}
                      className="inline-flex h-6 w-6 items-center justify-center rounded border border-red-400/30 bg-red-500/20 text-red-200 transition hover:bg-red-500/30 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                      aria-label={`Eliminar ${filename}`}
                      title="Eliminar"
                    >
                      {isDeleting ? (
                        <span className="h-3 w-3 animate-spin rounded-full border border-red-200/70 border-t-transparent" />
                      ) : (
                        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none">
                          <path d="M6 7h12M10 11v6m4-6v6M9 7l.5-2h5L15 7m-7 0 .75 13h6.5L16 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-[var(--sg-text-muted)]">Sin archivos</p>
        )}
      </div>
    </section>
  );
}

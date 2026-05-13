"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Notificacion } from "@/types/notificaciones";

type NotificationDetailModalProps = {
  notification: Notificacion | null;
  onClose: () => void;
};

function formatDate(value?: string) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return new Intl.DateTimeFormat("es-EC", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Guayaquil"
  }).format(date);
}

function priorityClass(priority: string) {
  if (priority === "Crítica") {
    return "border-red-400/40 bg-red-400/10 text-red-100";
  }

  if (priority === "Alta") {
    return "border-amber-300/40 bg-amber-300/10 text-amber-100";
  }

  return "border-white/10 bg-white/[0.05] text-zinc-300";
}

function statusClass(status: string) {
  if (status === "No leída") {
    return "border-geek-lime/30 bg-geek-lime/10 text-geek-lime";
  }

  return "border-white/10 bg-white/[0.05] text-zinc-300";
}

export function NotificationDetailModal({ notification, onClose }: NotificationDetailModalProps) {
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!notification) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [notification, onClose]);

  if (!notification || !isMounted) {
    return null;
  }

  function handleGoToDetail() {
    if (!notification?.urlAccion) {
      return;
    }

    onClose();
    router.push(notification.urlAccion);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 px-4 py-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onMouseDown={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-white/10 bg-geek-black shadow-2xl shadow-black"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="border-b border-white/10 px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-normal text-geek-lime">{notification.tipo}</p>
              <h2 className="mt-2 text-xl font-semibold text-white">{notification.titulo}</h2>
              <p className="mt-2 text-xs text-zinc-500">{formatDate(notification.creado)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${priorityClass(notification.prioridad)}`}>
                {notification.prioridad}
              </span>
              <span className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${statusClass(notification.estado)}`}>
                {notification.estado}
              </span>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <p className="whitespace-pre-wrap text-sm leading-7 text-zinc-200">{notification.mensaje}</p>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-white/10 px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-white/10 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition hover:border-white/30 hover:text-white"
          >
            Cerrar
          </button>
          {notification.urlAccion ? (
            <button
              type="button"
              onClick={handleGoToDetail}
              className="rounded-md bg-geek-lime px-4 py-2.5 text-sm font-semibold text-geek-black transition hover:bg-white"
            >
              Ver detalle
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}

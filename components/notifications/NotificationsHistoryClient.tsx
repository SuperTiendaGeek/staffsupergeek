"use client";

import { useState } from "react";
import { NotificationDetailModal } from "@/components/notifications/NotificationDetailModal";
import type { Notificacion } from "@/types/notificaciones";

type NotificationsHistoryClientProps = {
  notifications: Notificacion[];
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

function statusClasses(status: string) {
  if (status === "No leída") {
    return "border-geek-lime/30 bg-geek-lime/10 text-geek-lime";
  }

  if (status === "Archivada") {
    return "border-white/10 bg-white/[0.04] text-zinc-500";
  }

  return "border-white/10 bg-white/[0.05] text-zinc-300";
}

function priorityClasses(priority: string) {
  if (priority === "Crítica") {
    return "text-red-100";
  }

  if (priority === "Alta") {
    return "text-amber-100";
  }

  return "text-zinc-300";
}

export function NotificationsHistoryClient({ notifications }: NotificationsHistoryClientProps) {
  const [items, setItems] = useState(notifications);
  const [selectedNotification, setSelectedNotification] = useState<Notificacion | null>(null);

  async function openNotification(notification: Notificacion) {
    let nextNotification = notification;

    if (notification.estado === "No leída") {
      const response = await fetch(`/api/notificaciones/${notification.id}/leer`, {
        method: "PATCH",
        credentials: "same-origin"
      });

      if (response.ok) {
        nextNotification = { ...notification, estado: "Leída", fechaLeida: new Date().toISOString() };
        setItems((current) => current.map((item) => item.id === notification.id ? nextNotification : item));
      }
    }

    setSelectedNotification(nextNotification);
  }

  return (
    <>
      <section className="w-full max-w-5xl overflow-hidden rounded-lg border border-white/10 bg-white/[0.035] text-left shadow-2xl shadow-black/20 backdrop-blur">
        <div className="divide-y divide-white/10">
          {items.length ? (
            items.map((notification) => (
              <button key={notification.id} type="button" onClick={() => void openNotification(notification)} className="block w-full p-5 text-left transition hover:bg-white/[0.04]">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${statusClasses(notification.estado)}`}>
                        {notification.estado}
                      </span>
                      <span className={`text-xs font-semibold ${priorityClasses(notification.prioridad)}`}>
                        {notification.prioridad}
                      </span>
                      <span className="text-xs text-zinc-500">{notification.tipo}</span>
                    </div>
                    <h2 className="mt-3 text-lg font-semibold text-white">{notification.titulo}</h2>
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-zinc-300">{notification.mensaje}</p>
                    <p className="mt-3 text-xs text-zinc-500">{formatDate(notification.creado)}</p>
                  </div>
                  {notification.urlAccion ? (
                    <span className="w-fit rounded-md border border-geek-lime/30 px-3 py-2 text-sm font-semibold text-geek-lime">
                      Ver detalle
                    </span>
                  ) : null}
                </div>
              </button>
            ))
          ) : (
            <p className="p-6 text-sm text-zinc-400">No tienes notificaciones registradas.</p>
          )}
        </div>
      </section>

      <NotificationDetailModal notification={selectedNotification} onClose={() => setSelectedNotification(null)} />
    </>
  );
}

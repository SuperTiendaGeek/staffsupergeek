"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NotificationDetailModal } from "@/components/notifications/NotificationDetailModal";
import type { Notificacion } from "@/types/notificaciones";

type NotificationsResponse = {
  success?: boolean;
  notifications?: Notificacion[];
  unreadCount?: number;
};

function formatDate(value?: string) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("es-EC", {
    dateStyle: "short",
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

function BellIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M15 17H9m10-1.5c-1.2-1.1-1.8-2.5-1.8-4.2V9a5.2 5.2 0 0 0-10.4 0v2.3c0 1.7-.6 3.1-1.8 4.2-.5.5-.2 1.5.6 1.5h12.8c.8 0 1.1-1 .6-1.5Z" />
      <path d="M10 20a2.2 2.2 0 0 0 4 0" />
    </svg>
  );
}

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notificacion[]>([]);
  const [selectedNotification, setSelectedNotification] = useState<Notificacion | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 352 });
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  async function loadSummary() {
    const response = await fetch("/api/notificaciones/resumen", { credentials: "same-origin" });
    const result = (await response.json()) as NotificationsResponse;

    if (response.ok && result.success) {
      setUnreadCount(result.unreadCount || 0);
    }
  }

  async function loadNotifications() {
    setIsLoading(true);

    try {
      const response = await fetch("/api/notificaciones?limit=8", { credentials: "same-origin" });
      const result = (await response.json()) as NotificationsResponse;

      if (response.ok && result.success) {
        setNotifications(result.notifications || []);
      }
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    setIsMounted(true);
    void loadSummary();
  }, []);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;

      if (!containerRef.current?.contains(target) && !dropdownRef.current?.contains(target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);

    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  function updateDropdownPosition() {
    const button = buttonRef.current;

    if (!button) {
      return;
    }

    const rect = button.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const width = Math.min(352, viewportWidth - 32);
    const left = Math.max(16, Math.min(rect.right - width, viewportWidth - width - 16));

    setDropdownPosition({
      top: rect.bottom + 12,
      left,
      width
    });
  }

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    updateDropdownPosition();

    window.addEventListener("resize", updateDropdownPosition);
    window.addEventListener("scroll", updateDropdownPosition, true);

    return () => {
      window.removeEventListener("resize", updateDropdownPosition);
      window.removeEventListener("scroll", updateDropdownPosition, true);
    };
  }, [isOpen]);

  async function handleToggle() {
    const nextOpen = !isOpen;

    if (nextOpen) {
      updateDropdownPosition();
    }

    setIsOpen(nextOpen);

    if (nextOpen) {
      await loadNotifications();
      await loadSummary();
    }
  }

  async function markAsRead(notification: Notificacion) {
    if (notification.estado !== "No leída") {
      return;
    }

    await fetch(`/api/notificaciones/${notification.id}/leer`, {
      method: "PATCH",
      credentials: "same-origin"
    });
    setNotifications((current) =>
      current.map((item) => item.id === notification.id ? { ...item, estado: "Leída", fechaLeida: new Date().toISOString() } : item)
    );
    setUnreadCount((current) => Math.max(0, current - 1));
  }

  async function openNotification(notification: Notificacion) {
    await markAsRead(notification);
    const readableNotification = {
      ...notification,
      estado: notification.estado === "No leída" ? "Leída" : notification.estado,
      fechaLeida: notification.fechaLeida || new Date().toISOString()
    };

    setSelectedNotification(readableNotification);
    setIsOpen(false);
  }

  async function markAllAsRead() {
    const response = await fetch("/api/notificaciones/leer-todas", {
      method: "PATCH",
      credentials: "same-origin"
    });

    if (response.ok) {
      setUnreadCount(0);
      setNotifications((current) => current.map((item) => ({ ...item, estado: item.estado === "No leída" ? "Leída" : item.estado })));
    }
  }

  const dropdown = isOpen && isMounted ? createPortal(
    <div
      ref={dropdownRef}
      className="fixed z-[9990] overflow-hidden rounded-lg border border-white/10 bg-geek-black shadow-2xl shadow-black/60"
      style={{ top: dropdownPosition.top, left: dropdownPosition.left, width: dropdownPosition.width }}
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-white">Notificaciones</p>
          <p className="text-xs text-zinc-500">{unreadCount} sin leer</p>
        </div>
        <button
          type="button"
          onClick={markAllAsRead}
          className="text-xs font-semibold text-geek-lime transition hover:text-white"
        >
          Marcar todas
        </button>
      </div>

      <div className="max-h-96 overflow-y-auto">
        {isLoading ? (
          <p className="px-4 py-5 text-sm text-zinc-400">Cargando notificaciones...</p>
        ) : notifications.length ? (
          notifications.map((notification) => {
            const content = (
              <div className={`block border-b border-white/10 px-4 py-3 text-left transition hover:bg-white/[0.04] ${notification.estado === "No leída" ? "bg-geek-lime/[0.04]" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <p className="line-clamp-1 text-sm font-semibold text-white">{notification.titulo}</p>
                  <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold ${priorityClass(notification.prioridad)}`}>
                    {notification.prioridad}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-400">{notification.mensaje}</p>
                <p className="mt-2 text-[11px] text-zinc-600">{formatDate(notification.creado)}</p>
              </div>
            );

            return (
              <button key={notification.id} type="button" onClick={() => void openNotification(notification)} className="w-full">
                {content}
              </button>
            );
          })
        ) : (
          <p className="px-4 py-5 text-sm text-zinc-400">No tienes notificaciones.</p>
        )}
      </div>

      <Link href="/notificaciones" className="block border-t border-white/10 px-4 py-3 text-center text-sm font-semibold text-geek-lime transition hover:bg-geek-lime/10 hover:text-white">
        Ver historial
      </Link>
    </div>,
    document.body
  ) : null;

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        className="relative grid h-10 w-10 place-items-center rounded-md border border-white/10 bg-black/20 text-zinc-200 transition hover:border-geek-lime/40 hover:text-geek-lime"
        aria-label="Abrir notificaciones"
      >
        <BellIcon />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-500 px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {dropdown}

      <NotificationDetailModal notification={selectedNotification} onClose={() => setSelectedNotification(null)} />
    </div>
  );
}

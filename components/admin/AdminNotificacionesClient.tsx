"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { PortalUser } from "@/types/admin-users";
import {
  NOTIFICACION_ENTIDAD_TIPOS,
  NOTIFICACION_ESTADOS,
  NOTIFICACION_PRIORIDADES,
  NOTIFICACION_TIPOS,
  type Notificacion
} from "@/types/notificaciones";

type AdminNotificacionesClientProps = {
  initialNotifications: Notificacion[];
  users: PortalUser[];
};

type CreateResponse = {
  success?: boolean;
  error?: string;
  notification?: Notificacion;
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
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Guayaquil"
  }).format(date);
}

export function AdminNotificacionesClient({ initialNotifications, users }: AdminNotificacionesClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [notifications, setNotifications] = useState(initialNotifications);
  const [destinatarioId, setDestinatarioId] = useState(users[0]?.id || "");
  const [tipo, setTipo] = useState("Sistema");
  const [prioridad, setPrioridad] = useState("Normal");
  const [titulo, setTitulo] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [urlAccion, setUrlAccion] = useState("");
  const [entidadTipo, setEntidadTipo] = useState("");
  const [entidadId, setEntidadId] = useState("");
  const [enviarEmail, setEnviarEmail] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateFilter(name: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (value) {
      params.set(name, value);
    } else {
      params.delete(name);
    }

    router.push(`/admin/notificaciones${params.toString() ? `?${params}` : ""}`);
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/admin/notificaciones", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destinatarioId,
          tipo,
          prioridad,
          titulo,
          mensaje,
          urlAccion,
          entidadTipo,
          entidadId,
          enviarEmail
        })
      });
      const result = (await response.json()) as CreateResponse;

      if (!response.ok || !result.success || !result.notification) {
        setError(result.error || "No se pudo crear la notificación");
        return;
      }

      setNotifications((current) => [result.notification as Notificacion, ...current]);
      setTitulo("");
      setMensaje("");
      setUrlAccion("");
      setEntidadTipo("");
      setEntidadId("");
      setEnviarEmail(false);
      setNotice("Notificación creada correctamente.");
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="w-full max-w-6xl space-y-5 text-left">
      {notice ? <p className="rounded-md border border-geek-lime/30 bg-geek-lime/10 px-4 py-3 text-sm text-geek-lime">{notice}</p> : null}
      {error ? <p className="rounded-md border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100">{error}</p> : null}

      <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/20 backdrop-blur">
        <h2 className="text-lg font-semibold text-white">Filtros</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <select defaultValue={searchParams.get("usuarioId") || ""} onChange={(event) => updateFilter("usuarioId", event.target.value)} className="rounded-md border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white">
            <option value="">Todos los usuarios</option>
            {users.map((user) => <option key={user.id} value={user.id}>{user.nombre || user.email}</option>)}
          </select>
          <select defaultValue={searchParams.get("estado") || ""} onChange={(event) => updateFilter("estado", event.target.value)} className="rounded-md border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white">
            <option value="">Todos los estados</option>
            {NOTIFICACION_ESTADOS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select defaultValue={searchParams.get("tipo") || ""} onChange={(event) => updateFilter("tipo", event.target.value)} className="rounded-md border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white">
            <option value="">Todos los tipos</option>
            {NOTIFICACION_TIPOS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select defaultValue={searchParams.get("prioridad") || ""} onChange={(event) => updateFilter("prioridad", event.target.value)} className="rounded-md border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white">
            <option value="">Todas las prioridades</option>
            {NOTIFICACION_PRIORIDADES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
      </div>

      <form onSubmit={handleCreate} className="rounded-lg border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/20 backdrop-blur">
        <h2 className="text-lg font-semibold text-white">Crear notificación manual</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm text-zinc-300">Destinatario</span>
            <select value={destinatarioId} onChange={(event) => setDestinatarioId(event.target.value)} required className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white">
              {users.map((user) => <option key={user.id} value={user.id}>{user.nombre || user.email}</option>)}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm text-zinc-300">Título</span>
            <input value={titulo} onChange={(event) => setTitulo(event.target.value)} required className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white" />
          </label>
          <label className="space-y-2">
            <span className="text-sm text-zinc-300">Tipo</span>
            <select value={tipo} onChange={(event) => setTipo(event.target.value)} className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white">
              {NOTIFICACION_TIPOS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm text-zinc-300">Prioridad</span>
            <select value={prioridad} onChange={(event) => setPrioridad(event.target.value)} className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white">
              {NOTIFICACION_PRIORIDADES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm text-zinc-300">Mensaje</span>
            <textarea value={mensaje} onChange={(event) => setMensaje(event.target.value)} required rows={4} className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white" />
          </label>
          <label className="space-y-2">
            <span className="text-sm text-zinc-300">URL Acción</span>
            <input value={urlAccion} onChange={(event) => setUrlAccion(event.target.value)} placeholder="/horarios" className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white" />
          </label>
          <label className="space-y-2">
            <span className="text-sm text-zinc-300">Entidad Tipo</span>
            <select value={entidadTipo} onChange={(event) => setEntidadTipo(event.target.value)} className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white">
              <option value="">Sin entidad</option>
              {NOTIFICACION_ENTIDAD_TIPOS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm text-zinc-300">Entidad ID</span>
            <input value={entidadId} onChange={(event) => setEntidadId(event.target.value)} className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white" />
          </label>
          <label className="flex items-center gap-3 self-end rounded-md border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-zinc-200">
            <input type="checkbox" checked={enviarEmail} onChange={(event) => setEnviarEmail(event.target.checked)} className="h-4 w-4 accent-geek-lime" />
            Enviar email
          </label>
        </div>
        <button type="submit" disabled={isSubmitting || !users.length} className="mt-4 rounded-md bg-geek-lime px-4 py-2.5 text-sm font-semibold text-geek-black transition hover:bg-white disabled:opacity-60">
          {isSubmitting ? "Creando..." : "Crear notificación"}
        </button>
      </form>

      <div className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.035] shadow-2xl shadow-black/20 backdrop-blur">
        <div className="border-b border-white/10 px-4 py-4">
          <h2 className="text-lg font-semibold text-white">Notificaciones enviadas</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1180px] w-full text-left text-sm">
            <thead className="bg-white/[0.04] text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Fecha</th>
                <th className="px-4 py-3 font-semibold">Usuario</th>
                <th className="px-4 py-3 font-semibold">Título</th>
                <th className="px-4 py-3 font-semibold">Tipo</th>
                <th className="px-4 py-3 font-semibold">Prioridad</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Mensaje</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10 text-zinc-300">
              {notifications.length ? notifications.map((notification) => (
                <tr key={notification.id}>
                  <td className="px-4 py-4">{formatDate(notification.creado)}</td>
                  <td className="px-4 py-4">
                    <p className="font-semibold text-white">{notification.destinatarioNombre || notification.destinatarioEmail || "Usuario"}</p>
                    {notification.destinatarioEmail ? <p className="mt-1 text-xs text-zinc-500">{notification.destinatarioEmail}</p> : null}
                  </td>
                  <td className="px-4 py-4 font-semibold text-white">{notification.titulo}</td>
                  <td className="px-4 py-4">{notification.tipo}</td>
                  <td className="px-4 py-4">{notification.prioridad}</td>
                  <td className="px-4 py-4">{notification.estado}</td>
                  <td className="px-4 py-4">{notification.estadoEmail || "No aplica"}</td>
                  <td className="px-4 py-4">{notification.mensaje}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-zinc-400">No hay notificaciones con los filtros actuales.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

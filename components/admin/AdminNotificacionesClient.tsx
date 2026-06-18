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
  notifications?: Notificacion[];
  summary?: {
    totalCreadas: number;
    totalEmailsEnviados: number;
    totalEmailsError: number;
    errores?: Array<{ destinatarioId: string; error: string }>;
  };
};

function formatDate(value?: string) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("es-EC", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Guayaquil"
  }).format(date);
}

function EstadoBadge({ estado }: { estado: string }) {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";
  if (estado === "No leída") return <span className={`${base} border border-[#D7FF4F]/30 bg-[#D7FF4F]/10 text-[#D7FF4F]`}>{estado}</span>;
  if (estado === "Archivada") return <span className={`${base} border border-[#3A3A36] bg-[#2D2E2A] text-[#A7A7A7]`}>{estado}</span>;
  return <span className={`${base} border border-[#3A3A36] bg-[#2D2E2A] text-[#CFCFCB]`}>{estado}</span>;
}

function PrioridadBadge({ prioridad }: { prioridad: string }) {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";
  if (prioridad === "Crítica") return <span className={`${base} border border-red-400/30 bg-red-400/10 text-red-300`}>{prioridad}</span>;
  if (prioridad === "Alta") return <span className={`${base} border border-orange-400/30 bg-orange-400/10 text-orange-300`}>{prioridad}</span>;
  return <span className={`${base} border border-[#3A3A36] bg-[#2D2E2A] text-[#A7A7A7]`}>{prioridad}</span>;
}

export function AdminNotificacionesClient({ initialNotifications, users }: AdminNotificacionesClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [notifications, setNotifications] = useState(initialNotifications);
  const activeUsers = users.some((u) => u.activo) ? users.filter((u) => u.activo) : users;

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [modoEnvio, setModoEnvio] = useState<"seleccionar" | "todos">("seleccionar");
  const [destinatarioIds, setDestinatarioIds] = useState<string[]>(users[0]?.id ? [users[0].id] : []);
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

  const filterUsuarioId = searchParams.get("usuarioId") ?? "";
  const filterEstado = searchParams.get("estado") ?? "";
  const filterTipo = searchParams.get("tipo") ?? "";
  const filterPrioridad = searchParams.get("prioridad") ?? "";
  const hasFilters = !!(filterUsuarioId || filterEstado || filterTipo || filterPrioridad);

  const filteredNotifications = notifications.filter((n) => {
    if (filterUsuarioId && !n.destinatarioIds.includes(filterUsuarioId)) return false;
    if (filterEstado && n.estado !== filterEstado) return false;
    if (filterTipo && n.tipo !== filterTipo) return false;
    if (filterPrioridad && n.prioridad !== filterPrioridad) return false;
    return true;
  });

  function updateFilter(name: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) { params.set(name, value); } else { params.delete(name); }
    router.push(`/admin/notificaciones${params.toString() ? `?${params}` : ""}`, { scroll: false });
  }

  function clearFilters() {
    router.push("/admin/notificaciones", { scroll: false });
  }

  function toggleDestinatario(userId: string) {
    setDestinatarioIds((cur) =>
      cur.includes(userId) ? cur.filter((id) => id !== userId) : [...cur, userId]
    );
  }

  function openForm() {
    setError("");
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
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
          destinatarioIds: modoEnvio === "seleccionar" ? destinatarioIds : undefined,
          enviarATodos: modoEnvio === "todos",
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

      if (!response.ok || !result.success) {
        setError(result.error || "No se pudo crear la notificación");
        return;
      }

      const created = result.notifications || (result.notification ? [result.notification] : []);
      setNotifications((cur) => [...created, ...cur]);
      setTitulo("");
      setMensaje("");
      setUrlAccion("");
      setEntidadTipo("");
      setEntidadId("");
      setEnviarEmail(false);
      const s = result.summary;
      setNotice(
        s
          ? `Notificaciones creadas: ${s.totalCreadas}. Emails enviados: ${s.totalEmailsEnviados}. Emails con error: ${s.totalEmailsError}.`
          : "Notificación creada correctamente."
      );
      closeForm();
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="w-full space-y-4 text-left">
      {notice ? (
        <p className="rounded-lg border border-[#D7FF4F]/30 bg-[#D7FF4F]/10 px-4 py-3 text-sm text-[#D7FF4F]">{notice}</p>
      ) : null}

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#F5F5F5]">Notificaciones</h1>
          <p className="mt-0.5 text-sm text-[#A7A7A7]">
            {filteredNotifications.length} resultado{filteredNotifications.length !== 1 ? "s" : ""}
            {hasFilters ? " con filtros activos" : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={openForm}
          className="h-9 shrink-0 rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-4 text-sm font-semibold text-[#10110E] transition hover:brightness-105"
        >
          + Nueva notificación
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filterUsuarioId}
          onChange={(e) => updateFilter("usuarioId", e.target.value)}
          className="rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2 text-sm text-[#F5F5F5] focus:border-[#D7FF4F]/70 focus:outline-none"
        >
          <option value="">Todos los usuarios</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.nombre || u.email}</option>)}
        </select>
        <select
          value={filterEstado}
          onChange={(e) => updateFilter("estado", e.target.value)}
          className="rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2 text-sm text-[#F5F5F5] focus:border-[#D7FF4F]/70 focus:outline-none"
        >
          <option value="">Todos los estados</option>
          {NOTIFICACION_ESTADOS.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select
          value={filterTipo}
          onChange={(e) => updateFilter("tipo", e.target.value)}
          className="rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2 text-sm text-[#F5F5F5] focus:border-[#D7FF4F]/70 focus:outline-none"
        >
          <option value="">Todos los tipos</option>
          {NOTIFICACION_TIPOS.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select
          value={filterPrioridad}
          onChange={(e) => updateFilter("prioridad", e.target.value)}
          className="rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2 text-sm text-[#F5F5F5] focus:border-[#D7FF4F]/70 focus:outline-none"
        >
          <option value="">Todas las prioridades</option>
          {NOTIFICACION_PRIORIDADES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2 text-sm text-[#A7A7A7] transition hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F]"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-[1rem] border border-[#3A3A36] bg-[#252622] shadow-xl shadow-black/20">
        <div className="overflow-x-auto">
          <table className="min-w-[860px] w-full text-left text-sm">
            <thead className="bg-[#30312D] text-xs uppercase text-[#A7A7A7]">
              <tr>
                <th className="px-4 py-3 font-semibold">Fecha</th>
                <th className="px-4 py-3 font-semibold">Usuario</th>
                <th className="px-4 py-3 font-semibold">Título / Mensaje</th>
                <th className="px-4 py-3 font-semibold">Tipo</th>
                <th className="px-4 py-3 font-semibold">Prioridad</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold">Email</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#3A3A36]">
              {filteredNotifications.length ? filteredNotifications.map((n) => (
                <tr key={n.id} className="bg-[#252622] transition hover:bg-[#2D2E2A]">
                  <td className="whitespace-nowrap px-4 py-4 text-xs text-[#A7A7A7]">{formatDate(n.creado)}</td>
                  <td className="px-4 py-4">
                    <p className="font-semibold text-[#F5F5F5]">{n.destinatarioNombre || n.destinatarioEmail || "Usuario"}</p>
                    {n.destinatarioEmail ? <p className="mt-0.5 text-xs text-[#A7A7A7]">{n.destinatarioEmail}</p> : null}
                  </td>
                  <td className="max-w-[240px] px-4 py-4">
                    <p className="truncate font-semibold text-[#F5F5F5]">{n.titulo}</p>
                    <p className="mt-0.5 truncate text-xs text-[#A7A7A7]">{n.mensaje}</p>
                  </td>
                  <td className="px-4 py-4 text-[#CFCFCB]">{n.tipo}</td>
                  <td className="px-4 py-4"><PrioridadBadge prioridad={n.prioridad} /></td>
                  <td className="px-4 py-4"><EstadoBadge estado={n.estado} /></td>
                  <td className="px-4 py-4 text-xs text-[#A7A7A7]">{n.estadoEmail || "—"}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-[#A7A7A7]">
                    {hasFilters ? "No hay notificaciones con los filtros actuales." : "Aún no hay notificaciones enviadas."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drawer backdrop */}
      {isFormOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
          onClick={closeForm}
        />
      )}

      {/* Drawer panel */}
      <div
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-[#3A3A36] bg-[#1E1F1C] shadow-2xl transition-transform duration-300 ${isFormOpen ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between border-b border-[#3A3A36] px-5 py-4">
          <h2 className="text-base font-semibold text-[#F5F5F5]">Nueva notificación</h2>
          <button
            type="button"
            onClick={closeForm}
            className="rounded-full border border-[#3A3A36] p-1.5 text-[#CFCFCB] transition hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Drawer body */}
        <form onSubmit={handleCreate} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {error ? (
              <p className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2.5 text-sm text-red-300">{error}</p>
            ) : null}

            {/* Destinatarios */}
            <div className="rounded-[0.75rem] border border-[#3A3A36] bg-[#252622] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#F5F5F5]">Destinatarios</p>
                  <p className="mt-0.5 text-xs text-[#A7A7A7]">Una notificación individual por usuario.</p>
                </div>
                <div className="grid grid-cols-2 gap-1 rounded-lg border border-[#3A3A36] bg-[#30312D] p-1">
                  <button
                    type="button"
                    onClick={() => setModoEnvio("seleccionar")}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${modoEnvio === "seleccionar" ? "bg-[#D7FF4F] text-[#10110E]" : "text-[#CFCFCB] hover:bg-[#3A3A36]"}`}
                  >
                    Seleccionar
                  </button>
                  <button
                    type="button"
                    onClick={() => setModoEnvio("todos")}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${modoEnvio === "todos" ? "bg-[#D7FF4F] text-[#10110E]" : "text-[#CFCFCB] hover:bg-[#3A3A36]"}`}
                  >
                    Todos activos
                  </button>
                </div>
              </div>

              {modoEnvio === "todos" ? (
                <p className="mt-3 rounded-lg border border-[#D7FF4F]/25 bg-[#D7FF4F]/10 px-3 py-2.5 text-sm text-[#CFCFCB]">
                  Se enviará a todos los usuarios activos ({activeUsers.length}).
                </p>
              ) : (
                <div className="mt-3 max-h-44 overflow-y-auto rounded-lg border border-[#3A3A36] bg-[#1E1F1C]">
                  {users.length ? users.map((u) => (
                    <label key={u.id} className="flex cursor-pointer items-center gap-3 border-b border-[#3A3A36] px-3 py-2.5 last:border-b-0 hover:bg-[#2D2E2A]">
                      <input
                        type="checkbox"
                        checked={destinatarioIds.includes(u.id)}
                        onChange={() => toggleDestinatario(u.id)}
                        className="h-4 w-4 shrink-0 accent-[#D7FF4F]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-[#F5F5F5]">{u.nombre || u.email}</span>
                        <span className="mt-0.5 block truncate text-xs text-[#A7A7A7]">{u.email}{u.activo ? "" : " · Inactivo"}</span>
                      </span>
                    </label>
                  )) : (
                    <p className="px-3 py-4 text-sm text-[#A7A7A7]">No hay usuarios disponibles.</p>
                  )}
                </div>
              )}
            </div>

            {/* Título */}
            <label className="block space-y-1.5">
              <span className="text-sm text-[#CFCFCB]">Título <span className="text-red-400">*</span></span>
              <input
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                required
                placeholder="Ej: Recordatorio de horario"
                className="w-full rounded-lg border border-[#3A3A36] bg-[#252622] px-3 py-2 text-sm text-[#F5F5F5] placeholder:text-[#A7A7A7]/50 focus:border-[#D7FF4F]/70 focus:outline-none"
              />
            </label>

            {/* Tipo + Prioridad */}
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1.5">
                <span className="text-sm text-[#CFCFCB]">Tipo</span>
                <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-full rounded-lg border border-[#3A3A36] bg-[#252622] px-3 py-2 text-sm text-[#F5F5F5] focus:border-[#D7FF4F]/70 focus:outline-none">
                  {NOTIFICACION_TIPOS.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm text-[#CFCFCB]">Prioridad</span>
                <select value={prioridad} onChange={(e) => setPrioridad(e.target.value)} className="w-full rounded-lg border border-[#3A3A36] bg-[#252622] px-3 py-2 text-sm text-[#F5F5F5] focus:border-[#D7FF4F]/70 focus:outline-none">
                  {NOTIFICACION_PRIORIDADES.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
            </div>

            {/* Mensaje */}
            <label className="block space-y-1.5">
              <span className="text-sm text-[#CFCFCB]">Mensaje <span className="text-red-400">*</span></span>
              <textarea
                value={mensaje}
                onChange={(e) => setMensaje(e.target.value)}
                required
                rows={3}
                placeholder="Contenido de la notificación..."
                className="w-full rounded-lg border border-[#3A3A36] bg-[#252622] px-3 py-2 text-sm text-[#F5F5F5] placeholder:text-[#A7A7A7]/50 focus:border-[#D7FF4F]/70 focus:outline-none"
              />
            </label>

            {/* URL Acción */}
            <label className="block space-y-1.5">
              <span className="text-sm text-[#CFCFCB]">URL Acción <span className="text-xs text-[#A7A7A7]">(opcional)</span></span>
              <input
                value={urlAccion}
                onChange={(e) => setUrlAccion(e.target.value)}
                placeholder="/horarios"
                className="w-full rounded-lg border border-[#3A3A36] bg-[#252622] px-3 py-2 text-sm text-[#F5F5F5] placeholder:text-[#A7A7A7]/50 focus:border-[#D7FF4F]/70 focus:outline-none"
              />
            </label>

            {/* Entidad Tipo + ID */}
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1.5">
                <span className="text-sm text-[#CFCFCB]">Entidad Tipo</span>
                <select value={entidadTipo} onChange={(e) => setEntidadTipo(e.target.value)} className="w-full rounded-lg border border-[#3A3A36] bg-[#252622] px-3 py-2 text-sm text-[#F5F5F5] focus:border-[#D7FF4F]/70 focus:outline-none">
                  <option value="">Sin entidad</option>
                  {NOTIFICACION_ENTIDAD_TIPOS.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm text-[#CFCFCB]">Entidad ID</span>
                <input
                  value={entidadId}
                  onChange={(e) => setEntidadId(e.target.value)}
                  className="w-full rounded-lg border border-[#3A3A36] bg-[#252622] px-3 py-2 text-sm text-[#F5F5F5] focus:border-[#D7FF4F]/70 focus:outline-none"
                />
              </label>
            </div>

            {/* Enviar email */}
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#3A3A36] bg-[#252622] px-3 py-2.5 text-sm text-[#CFCFCB]">
              <input type="checkbox" checked={enviarEmail} onChange={(e) => setEnviarEmail(e.target.checked)} className="h-4 w-4 accent-[#D7FF4F]" />
              Enviar también por email
            </label>
          </div>

          {/* Drawer footer */}
          <div className="border-t border-[#3A3A36] px-5 py-4">
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={isSubmitting || !users.length || (modoEnvio === "seleccionar" && destinatarioIds.length === 0)}
                className="flex-1 rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-4 py-2 text-sm font-semibold text-[#10110E] transition hover:brightness-105 disabled:opacity-60"
              >
                {isSubmitting ? "Creando..." : "Crear notificación"}
              </button>
              <button
                type="button"
                onClick={closeForm}
                className="rounded-full border border-[#3A3A36] px-4 py-2 text-sm text-[#CFCFCB] transition hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F]"
              >
                Cancelar
              </button>
            </div>
          </div>
        </form>
      </div>
    </section>
  );
}

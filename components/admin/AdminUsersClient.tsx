"use client";

import { FormEvent, useMemo, useState } from "react";
import type { PortalUser } from "@/types/admin-users";

type AdminUsersClientProps = {
  initialUsers: PortalUser[];
  availableApps: string[];
  currentUserId: string;
};

type UserFormState = {
  nombre: string;
  email: string;
  password: string;
  rol: string;
  appsPermitidas: string[];
  activo: boolean;
  requiere2FA: boolean;
};

type ApiResult = {
  success?: boolean;
  error?: string;
  user?: PortalUser;
  users?: PortalUser[];
};

const roles = ["Administrador", "Manager", "Staff", "Finanzas", "Técnico"];

const emptyForm: UserFormState = {
  nombre: "",
  email: "",
  password: "",
  rol: "Staff",
  appsPermitidas: [],
  activo: true,
  requiere2FA: false
};

function userToForm(user: PortalUser): UserFormState {
  return {
    nombre: user.nombre,
    email: user.email,
    password: "",
    rol: user.rol,
    appsPermitidas: user.appsPermitidas,
    activo: user.activo,
    requiere2FA: user.requiere2FA
  };
}

function StatusBadge({ activo }: { activo: boolean }) {
  return (
    <span
      className={
        activo
          ? "inline-flex rounded-md border border-geek-lime/30 bg-geek-lime/10 px-2.5 py-1 text-xs font-semibold text-geek-lime"
          : "inline-flex rounded-md border border-zinc-500/30 bg-zinc-500/10 px-2.5 py-1 text-xs font-semibold text-zinc-300"
      }
    >
      {activo ? "Activo" : "Inactivo"}
    </span>
  );
}

function ToggleButton({
  checked,
  label,
  onChange
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-md border border-white/10 bg-black/20 px-3 py-2 text-left text-sm text-zinc-200 transition hover:border-geek-lime/40"
    >
      <span>{label}</span>
      <span
        className={
          checked
            ? "h-5 w-9 rounded-full bg-geek-lime p-0.5"
            : "h-5 w-9 rounded-full bg-zinc-700 p-0.5"
        }
      >
        <span
          className={
            checked
              ? "block h-4 w-4 translate-x-4 rounded-full bg-geek-black transition"
              : "block h-4 w-4 rounded-full bg-zinc-300 transition"
          }
        />
      </span>
    </button>
  );
}

export function AdminUsersClient({ initialUsers, availableApps, currentUserId }: AdminUsersClientProps) {
  const [users, setUsers] = useState(initialUsers);
  const [mode, setMode] = useState<"create" | "edit" | null>(null);
  const [editingUser, setEditingUser] = useState<PortalUser | null>(null);
  const [passwordUser, setPasswordUser] = useState<PortalUser | null>(null);
  const [statusUser, setStatusUser] = useState<PortalUser | null>(null);
  const [form, setForm] = useState<UserFormState>(emptyForm);
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const roleOptions = useMemo(() => {
    const knownRoles = new Set([...roles, ...users.map((user) => user.rol).filter(Boolean)]);
    return Array.from(knownRoles);
  }, [users]);

  function openCreate() {
    setError("");
    setNotice("");
    setEditingUser(null);
    setForm(emptyForm);
    setMode("create");
  }

  function openEdit(user: PortalUser) {
    setError("");
    setNotice("");
    setEditingUser(user);
    setForm(userToForm(user));
    setMode("edit");
  }

  function closeModals() {
    setMode(null);
    setEditingUser(null);
    setPasswordUser(null);
    setStatusUser(null);
    setNewPassword("");
    setError("");
  }

  function updateUserInList(user: PortalUser) {
    setUsers((currentUsers) => currentUsers.map((item) => (item.id === user.id ? user : item)));
  }

  function toggleApp(app: string) {
    setForm((current) => ({
      ...current,
      appsPermitidas: current.appsPermitidas.includes(app)
        ? current.appsPermitidas.filter((item) => item !== app)
        : [...current.appsPermitidas, app]
    }));
  }

  async function handleSaveUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setIsSubmitting(true);

    const payload = {
      nombre: form.nombre,
      email: form.email,
      rol: form.rol,
      appsPermitidas: form.appsPermitidas,
      activo: form.activo,
      requiere2FA: form.requiere2FA,
      ...(mode === "create" ? { password: form.password } : {})
    };

    try {
      const response = await fetch(mode === "create" ? "/api/admin/usuarios" : `/api/admin/usuarios/${editingUser?.id}`, {
        method: mode === "create" ? "POST" : "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = (await response.json()) as ApiResult;

      if (!response.ok || !result.success || !result.user) {
        setError(result.error || "No se pudo guardar el usuario");
        return;
      }

      if (mode === "create") {
        setUsers((currentUsers) => [...currentUsers, result.user as PortalUser]);
        setNotice("Usuario creado correctamente");
      } else {
        updateUserInList(result.user);
        setNotice("Usuario actualizado correctamente");
      }

      closeModals();
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!passwordUser) {
      return;
    }

    setError("");
    setNotice("");
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/admin/usuarios/${passwordUser.id}/password`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword })
      });
      const result = (await response.json()) as ApiResult;

      if (!response.ok || !result.success) {
        setError(result.error || "No se pudo cambiar la contraseña");
        return;
      }

      setNotice("Contrasena actualizada correctamente");
      closeModals();
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleStatusChange() {
    if (!statusUser) {
      return;
    }

    setError("");
    setNotice("");
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/admin/usuarios/${statusUser.id}/status`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activo: !statusUser.activo })
      });
      const result = (await response.json()) as ApiResult;

      if (!response.ok || !result.success || !result.user) {
        setError(result.error || "No se pudo actualizar el estado");
        return;
      }

      updateUserInList(result.user);
      setNotice(result.user.activo ? "Usuario activado" : "Usuario desactivado");
      closeModals();
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="w-full space-y-5">
      <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.045] p-4 text-left shadow-2xl shadow-black/20 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-zinc-300">{users.length} usuarios registrados</p>
          <p className="mt-1 text-xs text-zinc-500">Los cambios se aplican directamente en Airtable desde el servidor.</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-md bg-geek-lime px-4 py-2.5 text-sm font-semibold text-geek-black transition hover:bg-white"
        >
          Crear usuario
        </button>
      </div>

      {notice ? (
        <p className="rounded-md border border-geek-lime/30 bg-geek-lime/10 px-4 py-3 text-sm text-geek-lime" role="status">
          {notice}
        </p>
      ) : null}
      {error && !mode && !passwordUser && !statusUser ? (
        <p className="rounded-md border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100" role="alert">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.035] shadow-2xl shadow-black/20 backdrop-blur">
        <div className="hidden min-w-full overflow-x-auto lg:block">
          <table className="min-w-full divide-y divide-white/10 text-left text-sm">
            <thead className="bg-white/[0.04] text-xs uppercase text-zinc-400">
              <tr>
                <th className="px-4 py-3 font-semibold">Nombre</th>
                <th className="px-4 py-3 font-semibold">Correo</th>
                <th className="px-4 py-3 font-semibold">Rol</th>
                <th className="px-4 py-3 font-semibold">Apps permitidas</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {users.map((user) => (
                <tr key={user.id} className="align-top text-zinc-200">
                  <td className="px-4 py-4 font-medium text-white">{user.nombre}</td>
                  <td className="px-4 py-4 text-zinc-300">{user.email}</td>
                  <td className="px-4 py-4">{user.rol}</td>
                  <td className="px-4 py-4">
                    <div className="flex max-w-xs flex-wrap gap-1.5">
                      {user.appsPermitidas.length ? (
                        user.appsPermitidas.map((app) => (
                          <span key={app} className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-xs text-zinc-300">
                            {app}
                          </span>
                        ))
                      ) : (
                        <span className="text-zinc-500">Sin apps</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <StatusBadge activo={user.activo} />
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => openEdit(user)} className="rounded-md border border-white/10 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:border-geek-lime/50 hover:text-geek-lime">
                        Editar
                      </button>
                      <button type="button" onClick={() => setPasswordUser(user)} className="rounded-md border border-white/10 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:border-geek-lime/50 hover:text-geek-lime">
                        Contraseña
                      </button>
                      <button
                        type="button"
                        disabled={user.id === currentUserId && user.activo}
                        onClick={() => setStatusUser(user)}
                        className="rounded-md border border-white/10 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:border-geek-lime/50 hover:text-geek-lime disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {user.activo ? "Desactivar" : "Activar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid gap-3 p-3 lg:hidden">
          {users.map((user) => (
            <article key={user.id} className="rounded-lg border border-white/10 bg-black/20 p-4 text-left">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-white">{user.nombre}</h2>
                  <p className="truncate text-sm text-zinc-400">{user.email}</p>
                </div>
                <StatusBadge activo={user.activo} />
              </div>
              <p className="mt-3 text-sm text-zinc-300">{user.rol}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {user.appsPermitidas.length ? user.appsPermitidas.map((app) => (
                  <span key={app} className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-xs text-zinc-300">
                    {app}
                  </span>
                )) : <span className="text-sm text-zinc-500">Sin apps</span>}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <button type="button" onClick={() => openEdit(user)} className="rounded-md border border-white/10 px-2 py-2 text-xs font-medium text-zinc-200">Editar</button>
                <button type="button" onClick={() => setPasswordUser(user)} className="rounded-md border border-white/10 px-2 py-2 text-xs font-medium text-zinc-200">Contraseña</button>
                <button type="button" disabled={user.id === currentUserId && user.activo} onClick={() => setStatusUser(user)} className="rounded-md border border-white/10 px-2 py-2 text-xs font-medium text-zinc-200 disabled:opacity-50">
                  {user.activo ? "Off" : "On"}
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>

      {mode ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 py-8 backdrop-blur-sm">
          <form onSubmit={handleSaveUser} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-white/10 bg-[#101318] p-5 text-left shadow-2xl shadow-black">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white">{mode === "create" ? "Crear usuario" : "Editar usuario"}</h2>
                <p className="mt-1 text-sm text-zinc-400">El hash de contraseña se genera y queda solo en servidor.</p>
              </div>
              <button type="button" onClick={closeModals} className="rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-300">Cerrar</button>
            </div>

            {error ? <p className="mt-4 rounded-md border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-100">{error}</p> : null}

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-zinc-200">
                Nombre
                <input value={form.nombre} onChange={(event) => setForm({ ...form, nombre: event.target.value })} className="mt-2 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2.5 text-white outline-none focus:border-geek-lime" />
              </label>
              <label className="block text-sm font-medium text-zinc-200">
                Correo
                <input type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="mt-2 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2.5 text-white outline-none focus:border-geek-lime" />
              </label>
              {mode === "create" ? (
                <label className="block text-sm font-medium text-zinc-200">
                  Contraseña temporal
                  <input type="password" required value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className="mt-2 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2.5 text-white outline-none focus:border-geek-lime" />
                </label>
              ) : null}
              <label className="block text-sm font-medium text-zinc-200">
                Rol
                <select value={form.rol} onChange={(event) => setForm({ ...form, rol: event.target.value })} className="mt-2 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2.5 text-white outline-none focus:border-geek-lime">
                  {roleOptions.map((role) => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-5 space-y-3">
              <p className="text-sm font-medium text-zinc-200">Apps permitidas</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {availableApps.map((app) => (
                  <label key={app} className="flex items-center gap-3 rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-200">
                    <input type="checkbox" checked={form.appsPermitidas.includes(app)} onChange={() => toggleApp(app)} className="h-4 w-4 accent-geek-lime" />
                    {app}
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <ToggleButton checked={form.activo} label="Usuario activo" onChange={(checked) => setForm({ ...form, activo: checked })} />
              <ToggleButton checked={form.requiere2FA} label="Requiere 2FA" onChange={(checked) => setForm({ ...form, requiere2FA: checked })} />
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={closeModals} className="rounded-md border border-white/10 px-4 py-2.5 text-sm font-medium text-zinc-200">Cancelar</button>
              <button type="submit" disabled={isSubmitting} className="rounded-md bg-geek-lime px-4 py-2.5 text-sm font-semibold text-geek-black transition hover:bg-white disabled:opacity-60">
                {isSubmitting ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {passwordUser ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 py-8 backdrop-blur-sm">
          <form onSubmit={handlePasswordChange} className="w-full max-w-md rounded-lg border border-white/10 bg-[#101318] p-5 text-left shadow-2xl shadow-black">
            <h2 className="text-xl font-semibold text-white">Cambiar contraseña</h2>
            <p className="mt-1 text-sm text-zinc-400">{passwordUser.email}</p>
            {error ? <p className="mt-4 rounded-md border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-100">{error}</p> : null}
            <label className="mt-5 block text-sm font-medium text-zinc-200">
              Contraseña temporal
              <input type="password" required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="mt-2 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2.5 text-white outline-none focus:border-geek-lime" />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={closeModals} className="rounded-md border border-white/10 px-4 py-2.5 text-sm font-medium text-zinc-200">Cancelar</button>
              <button type="submit" disabled={isSubmitting} className="rounded-md bg-geek-lime px-4 py-2.5 text-sm font-semibold text-geek-black transition hover:bg-white disabled:opacity-60">
                Actualizar
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {statusUser ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-white/10 bg-[#101318] p-5 text-left shadow-2xl shadow-black">
            <h2 className="text-xl font-semibold text-white">{statusUser.activo ? "Desactivar usuario" : "Activar usuario"}</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              Vas a {statusUser.activo ? "desactivar" : "activar"} el acceso de {statusUser.email}.
            </p>
            {error ? <p className="mt-4 rounded-md border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-100">{error}</p> : null}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={closeModals} className="rounded-md border border-white/10 px-4 py-2.5 text-sm font-medium text-zinc-200">Cancelar</button>
              <button type="button" disabled={isSubmitting} onClick={handleStatusChange} className="rounded-md bg-geek-lime px-4 py-2.5 text-sm font-semibold text-geek-black transition hover:bg-white disabled:opacity-60">
                Confirmar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

"use client";

import { FormEvent, useMemo, useState } from "react";
import { isProviderRole } from "@/lib/apps";
import {
  MODULO_POR_APP_PERMITIDA,
  PANTALLAS_POR_MODULO,
  pantallasVisibles,
  type ModuloConPantallas,
} from "@/lib/permissions/pantallas";
import {
  camposConfigurables,
  estadoCampo,
  type CampoDef,
  type EstadoCampoPersonalizado,
} from "@/lib/permissions/campos";
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

const roles = ["Administrador", "Manager", "Staff", "Finanzas", "Técnico", "Proveedor"];

const emptyForm: UserFormState = {
  nombre: "",
  email: "",
  password: "",
  rol: "Staff",
  appsPermitidas: [],
  activo: true,
  requiere2FA: false
};

// Módulos con control de pantallas a los que este usuario tiene acceso —
// hoy solo "Shipping" está mapeado (ver MODULO_POR_APP_PERMITIDA), así que
// esto será una lista de 0 o 1 elemento hasta que se agregue otro módulo.
function modulosConPantallasDe(user: PortalUser): ModuloConPantallas[] {
  const modulos = user.appsPermitidas
    .map((app) => MODULO_POR_APP_PERMITIDA[app])
    .filter((m): m is ModuloConPantallas => Boolean(m));
  return Array.from(new Set(modulos));
}

// Pantallas del usuario que además tienen un catálogo de campos configurable
// (hoy solo Shipping → Items) — el botón "Campos" solo aparece si esto no
// está vacío.
function pantallasConCamposDe(user: PortalUser): Array<{ modulo: ModuloConPantallas; pantalla: string; label: string; campos: readonly CampoDef[] }> {
  const resultado: Array<{ modulo: ModuloConPantallas; pantalla: string; label: string; campos: readonly CampoDef[] }> = [];
  for (const modulo of modulosConPantallasDe(user)) {
    for (const pantalla of PANTALLAS_POR_MODULO[modulo]) {
      const campos = camposConfigurables(modulo, pantalla.key);
      if (campos.length > 0) resultado.push({ modulo, pantalla: pantalla.key, label: pantalla.label, campos });
    }
  }
  return resultado;
}

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
          ? "inline-flex rounded-full border border-[#D7FF4F]/30 bg-[#D7FF4F]/10 px-2.5 py-1 text-xs font-semibold text-[#D7FF4F]"
          : "inline-flex rounded-full border border-[#3A3A36] bg-[#2D2E2A] px-2.5 py-1 text-xs font-semibold text-[#A7A7A7]"
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
      className="flex w-full items-center justify-between gap-4 rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2 text-left text-sm text-[#CFCFCB] transition hover:border-[#D7FF4F]/40"
    >
      <span>{label}</span>
      <span
        className={
          checked
            ? "h-5 w-9 rounded-full bg-[#D7FF4F] p-0.5"
            : "h-5 w-9 rounded-full bg-[#3A3A36] p-0.5"
        }
      >
        <span
          className={
            checked
              ? "block h-4 w-4 translate-x-4 rounded-full bg-[#10110E] transition"
              : "block h-4 w-4 rounded-full bg-[#A7A7A7] transition"
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
  const [pantallasUser, setPantallasUser] = useState<PortalUser | null>(null);
  const [pantallasForm, setPantallasForm] = useState<Record<string, Set<string>>>({});
  const [camposUser, setCamposUser] = useState<PortalUser | null>(null);
  // clave "modulo::pantalla" -> { campoKey: estado }. "editable" es el default
  // implícito (ausente del JSON guardado), pero se guarda explícito en el
  // form para que el <select> tenga un valor.
  const [camposForm, setCamposForm] = useState<Record<string, Record<string, EstadoCampoPersonalizado | "editable">>>({});
  const [form, setForm] = useState<UserFormState>(emptyForm);
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const roleOptions = useMemo(() => {
    const knownRoles = new Set([...roles, ...users.map((user) => user.rol).filter(Boolean)]);
    return Array.from(knownRoles);
  }, [users]);
  const providerRoleSelected = isProviderRole(form.rol);

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
    setPantallasUser(null);
    setCamposUser(null);
    setNewPassword("");
    setError("");
  }

  function openPantallas(user: PortalUser) {
    setError("");
    setNotice("");
    const form: Record<string, Set<string>> = {};
    for (const modulo of modulosConPantallasDe(user)) {
      form[modulo] = new Set(pantallasVisibles(user.pantallasRestringidas, modulo).map((p) => p.key));
    }
    setPantallasForm(form);
    setPantallasUser(user);
  }

  function togglePantalla(modulo: string, key: string) {
    setPantallasForm((current) => {
      const visibles = new Set(current[modulo] ?? []);
      if (visibles.has(key)) visibles.delete(key);
      else visibles.add(key);
      return { ...current, [modulo]: visibles };
    });
  }

  async function handlePantallasSave() {
    if (!pantallasUser) return;
    setError("");
    setNotice("");
    setIsSubmitting(true);

    try {
      let lastUser: PortalUser | null = null;
      // Un PATCH por módulo — hoy es uno solo (Shipping), pero el contrato de
      // la ruta es "un módulo a la vez" para no arrastrar los demás sin querer.
      for (const [modulo, visibles] of Object.entries(pantallasForm)) {
        const pantallasOcultas = (PANTALLAS_POR_MODULO[modulo as ModuloConPantallas] ?? [])
          .map((p) => p.key)
          .filter((key) => !visibles.has(key));

        const response = await fetch(`/api/admin/usuarios/${pantallasUser.id}/pantallas`, {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modulo, pantallasOcultas }),
        });
        const result = (await response.json()) as ApiResult;

        if (!response.ok || !result.success || !result.user) {
          setError(result.error || "No se pudo guardar las pantallas");
          return;
        }
        lastUser = result.user;
      }

      if (lastUser) {
        updateUserInList(lastUser);
        setNotice("Pantallas actualizadas correctamente");
      }
      closeModals();
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setIsSubmitting(false);
    }
  }

  function updateUserInList(user: PortalUser) {
    setUsers((currentUsers) => currentUsers.map((item) => (item.id === user.id ? user : item)));
  }

  function openCampos(user: PortalUser) {
    setError("");
    setNotice("");
    const form: Record<string, Record<string, EstadoCampoPersonalizado | "editable">> = {};
    for (const { modulo, pantalla, campos } of pantallasConCamposDe(user)) {
      const clave = `${modulo}::${pantalla}`;
      form[clave] = {};
      for (const campo of campos) {
        form[clave][campo.key] = estadoCampo(user.camposRestringidos, modulo, pantalla, campo.key) ?? "editable";
      }
    }
    setCamposForm(form);
    setCamposUser(user);
  }

  function setCampoEstado(clave: string, campoKey: string, estado: EstadoCampoPersonalizado | "editable") {
    setCamposForm((current) => ({
      ...current,
      [clave]: { ...current[clave], [campoKey]: estado },
    }));
  }

  async function handleCamposSave() {
    if (!camposUser) return;
    setError("");
    setNotice("");
    setIsSubmitting(true);

    try {
      let lastUser: PortalUser | null = null;
      // Un PATCH por pantalla — hoy es una sola (Shipping → Items), mismo
      // contrato "una pantalla a la vez" que la ruta de pantallas.
      for (const [clave, estados] of Object.entries(camposForm)) {
        const [modulo, pantalla] = clave.split("::");
        const campos: Record<string, EstadoCampoPersonalizado> = {};
        for (const [campoKey, estado] of Object.entries(estados)) {
          if (estado !== "editable") campos[campoKey] = estado;
        }

        const response = await fetch(`/api/admin/usuarios/${camposUser.id}/campos`, {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modulo, pantalla, campos }),
        });
        const result = (await response.json()) as ApiResult;

        if (!response.ok || !result.success || !result.user) {
          setError(result.error || "No se pudo guardar los campos");
          return;
        }
        lastUser = result.user;
      }

      if (lastUser) {
        updateUserInList(lastUser);
        setNotice("Campos actualizados correctamente");
      }
      closeModals();
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setIsSubmitting(false);
    }
  }

  function toggleApp(app: string) {
    if (providerRoleSelected) return;

    setForm((current) => ({
      ...current,
      appsPermitidas: current.appsPermitidas.includes(app)
        ? current.appsPermitidas.filter((item) => item !== app)
        : [...current.appsPermitidas, app]
    }));
  }

  function updateRole(rol: string) {
    setForm((current) => ({
      ...current,
      rol,
      appsPermitidas: isProviderRole(rol) ? ["Shipping"] : current.appsPermitidas,
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
      appsPermitidas: isProviderRole(form.rol) ? ["Shipping"] : form.appsPermitidas,
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
      <div className="flex flex-col gap-3 rounded-[1rem] border border-[#3A3A36] bg-[#252622] p-4 text-left shadow-xl shadow-black/20 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-[#CFCFCB]">{users.length} usuarios registrados</p>
          <p className="mt-1 text-xs text-[#A7A7A7]">Los cambios se aplican directamente en Airtable desde el servidor.</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="h-9 rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-4 text-sm font-bold text-[#10110E] transition hover:brightness-105"
        >
          Crear usuario
        </button>
      </div>

      {notice ? (
        <p className="rounded-lg border border-[#D7FF4F]/30 bg-[#D7FF4F]/10 px-4 py-3 text-sm text-[#D7FF4F]" role="status">
          {notice}
        </p>
      ) : null}
      {error && !mode && !passwordUser && !statusUser && !pantallasUser && !camposUser ? (
        <p className="rounded-md border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100" role="alert">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-[1rem] border border-[#3A3A36] bg-[#252622] shadow-xl shadow-black/20">
        <div className="hidden min-w-full overflow-x-auto lg:block">
          <table className="min-w-full divide-y divide-[#3A3A36] text-left text-sm">
            <thead className="bg-[#30312D] text-xs uppercase text-[#A7A7A7]">
              <tr>
                <th className="px-4 py-3 font-semibold">Nombre</th>
                <th className="px-4 py-3 font-semibold">Correo</th>
                <th className="px-4 py-3 font-semibold">Rol</th>
                <th className="px-4 py-3 font-semibold">Apps permitidas</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#3A3A36]">
              {users.map((user) => (
                <tr key={user.id} className="bg-[#252622] align-top transition hover:bg-[#2D2E2A]">
                  <td className="px-4 py-4 font-medium text-[#F5F5F5]">{user.nombre}</td>
                  <td className="px-4 py-4 text-[#CFCFCB]">{user.email}</td>
                  <td className="px-4 py-4 text-[#CFCFCB]">{user.rol}</td>
                  <td className="px-4 py-4">
                    <div className="flex max-w-xs flex-wrap gap-1.5">
                      {user.appsPermitidas.length ? (
                        user.appsPermitidas.map((app) => (
                          <span key={app} className="rounded-full border border-[#3A3A36] bg-[#2D2E2A] px-2 py-1 text-xs text-[#CFCFCB]">
                            {app}
                          </span>
                        ))
                      ) : (
                        <span className="text-[#A7A7A7]">Sin apps</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <StatusBadge activo={user.activo} />
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => openEdit(user)} className="rounded-full border border-[#3A3A36] px-3 py-1.5 text-xs font-medium text-[#CFCFCB] transition hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F]">
                        Editar
                      </button>
                      <button type="button" onClick={() => setPasswordUser(user)} className="rounded-full border border-[#3A3A36] px-3 py-1.5 text-xs font-medium text-[#CFCFCB] transition hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F]">
                        Contraseña
                      </button>
                      {modulosConPantallasDe(user).length > 0 && (
                        <button type="button" onClick={() => openPantallas(user)} className="rounded-full border border-[#3A3A36] px-3 py-1.5 text-xs font-medium text-[#CFCFCB] transition hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F]">
                          Pantallas
                        </button>
                      )}
                      {pantallasConCamposDe(user).length > 0 && (
                        <button type="button" onClick={() => openCampos(user)} className="rounded-full border border-[#3A3A36] px-3 py-1.5 text-xs font-medium text-[#CFCFCB] transition hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F]">
                          Campos
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={user.id === currentUserId && user.activo}
                        onClick={() => setStatusUser(user)}
                        className="rounded-full border border-[#3A3A36] px-3 py-1.5 text-xs font-medium text-[#CFCFCB] transition hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F] disabled:cursor-not-allowed disabled:opacity-50"
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
            <article key={user.id} className="rounded-[0.75rem] border border-[#3A3A36] bg-[#2D2E2A] p-4 text-left">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-[#F5F5F5]">{user.nombre}</h2>
                  <p className="truncate text-sm text-[#A7A7A7]">{user.email}</p>
                </div>
                <StatusBadge activo={user.activo} />
              </div>
              <p className="mt-3 text-sm text-[#CFCFCB]">{user.rol}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {user.appsPermitidas.length ? user.appsPermitidas.map((app) => (
                  <span key={app} className="rounded-full border border-[#3A3A36] bg-[#1E1F1C] px-2 py-1 text-xs text-[#CFCFCB]">
                    {app}
                  </span>
                )) : <span className="text-sm text-[#A7A7A7]">Sin apps</span>}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => openEdit(user)} className="flex-1 rounded-full border border-[#3A3A36] px-2 py-2 text-xs font-medium text-[#CFCFCB] transition hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F]">Editar</button>
                <button type="button" onClick={() => setPasswordUser(user)} className="flex-1 rounded-full border border-[#3A3A36] px-2 py-2 text-xs font-medium text-[#CFCFCB] transition hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F]">Contraseña</button>
                {modulosConPantallasDe(user).length > 0 && (
                  <button type="button" onClick={() => openPantallas(user)} className="flex-1 rounded-full border border-[#3A3A36] px-2 py-2 text-xs font-medium text-[#CFCFCB] transition hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F]">Pantallas</button>
                )}
                {pantallasConCamposDe(user).length > 0 && (
                  <button type="button" onClick={() => openCampos(user)} className="flex-1 rounded-full border border-[#3A3A36] px-2 py-2 text-xs font-medium text-[#CFCFCB] transition hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F]">Campos</button>
                )}
                <button type="button" disabled={user.id === currentUserId && user.activo} onClick={() => setStatusUser(user)} className="flex-1 rounded-full border border-[#3A3A36] px-2 py-2 text-xs font-medium text-[#CFCFCB] transition hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F] disabled:opacity-50">
                  {user.activo ? "Off" : "On"}
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>

      {mode ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 px-4 py-8 backdrop-blur-sm">
          <form onSubmit={handleSaveUser} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[1rem] border border-[#3A3A36] bg-[#252622] p-5 text-left shadow-2xl shadow-black">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-[#F5F5F5]">{mode === "create" ? "Crear usuario" : "Editar usuario"}</h2>
                <p className="mt-1 text-sm text-[#A7A7A7]">El hash de contraseña se genera y queda solo en servidor.</p>
              </div>
              <button type="button" onClick={closeModals} className="rounded-full border border-[#3A3A36] px-3 py-1.5 text-sm text-[#CFCFCB] transition hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F]">Cerrar</button>
            </div>

            {error ? <p className="mt-4 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-100">{error}</p> : null}

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-[#CFCFCB]">
                Nombre
                <input value={form.nombre} onChange={(event) => setForm({ ...form, nombre: event.target.value })} className="mt-2 w-full rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2 text-[#F5F5F5] focus:border-[#D7FF4F]/70 focus:outline-none" />
              </label>
              <label className="block text-sm font-medium text-[#CFCFCB]">
                Correo
                <input type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="mt-2 w-full rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2 text-[#F5F5F5] focus:border-[#D7FF4F]/70 focus:outline-none" />
              </label>
              {mode === "create" ? (
                <label className="block text-sm font-medium text-[#CFCFCB]">
                  Contraseña temporal
                  <input type="password" required value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className="mt-2 w-full rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2 text-[#F5F5F5] focus:border-[#D7FF4F]/70 focus:outline-none" />
                </label>
              ) : null}
              <label className="block text-sm font-medium text-[#CFCFCB]">
                Rol
                <select value={form.rol} onChange={(event) => updateRole(event.target.value)} className="mt-2 w-full rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2 text-[#F5F5F5] focus:border-[#D7FF4F]/70 focus:outline-none">
                  {roleOptions.map((role) => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-5 space-y-3">
              <p className="text-sm font-medium text-[#CFCFCB]">Apps permitidas</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {availableApps.map((app) => (
                  <label key={app} className="flex items-center gap-3 rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2 text-sm text-[#CFCFCB]">
                    <input
                      type="checkbox"
                      checked={providerRoleSelected ? app === "Shipping" : form.appsPermitidas.includes(app)}
                      disabled={providerRoleSelected}
                      onChange={() => toggleApp(app)}
                      className="h-4 w-4 accent-[#D7FF4F] disabled:opacity-70"
                    />
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
              <button type="button" onClick={closeModals} className="rounded-full border border-[#3A3A36] px-4 py-2 text-sm font-medium text-[#CFCFCB] transition hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F]">Cancelar</button>
              <button type="submit" disabled={isSubmitting} className="rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-4 py-2 text-sm font-semibold text-[#10110E] transition hover:brightness-105 disabled:opacity-60">
                {isSubmitting ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {passwordUser ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 px-4 py-8 backdrop-blur-sm">
          <form onSubmit={handlePasswordChange} className="w-full max-w-md rounded-[1rem] border border-[#3A3A36] bg-[#252622] p-5 text-left shadow-2xl shadow-black">
            <h2 className="text-xl font-semibold text-[#F5F5F5]">Cambiar contraseña</h2>
            <p className="mt-1 text-sm text-[#A7A7A7]">{passwordUser.email}</p>
            {error ? <p className="mt-4 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-100">{error}</p> : null}
            <label className="mt-5 block text-sm font-medium text-[#CFCFCB]">
              Contraseña temporal
              <input type="password" required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="mt-2 w-full rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2 text-[#F5F5F5] focus:border-[#D7FF4F]/70 focus:outline-none" />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={closeModals} className="rounded-full border border-[#3A3A36] px-4 py-2 text-sm font-medium text-[#CFCFCB] transition hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F]">Cancelar</button>
              <button type="submit" disabled={isSubmitting} className="rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-4 py-2 text-sm font-semibold text-[#10110E] transition hover:brightness-105 disabled:opacity-60">
                Actualizar
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {statusUser ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[1rem] border border-[#3A3A36] bg-[#252622] p-5 text-left shadow-2xl shadow-black">
            <h2 className="text-xl font-semibold text-[#F5F5F5]">{statusUser.activo ? "Desactivar usuario" : "Activar usuario"}</h2>
            <p className="mt-2 text-sm leading-6 text-[#CFCFCB]">
              Vas a {statusUser.activo ? "desactivar" : "activar"} el acceso de {statusUser.email}.
            </p>
            {error ? <p className="mt-4 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-100">{error}</p> : null}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={closeModals} className="rounded-full border border-[#3A3A36] px-4 py-2 text-sm font-medium text-[#CFCFCB] transition hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F]">Cancelar</button>
              <button type="button" disabled={isSubmitting} onClick={handleStatusChange} className="rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-4 py-2 text-sm font-semibold text-[#10110E] transition hover:brightness-105 disabled:opacity-60">
                Confirmar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pantallasUser ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 px-4 py-8 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[1rem] border border-[#3A3A36] bg-[#252622] p-5 text-left shadow-2xl shadow-black">
            <h2 className="text-xl font-semibold text-[#F5F5F5]">Pantallas visibles</h2>
            <p className="mt-1 text-sm text-[#A7A7A7]">
              {pantallasUser.nombre} — desmarca una pantalla para ocultársela. Por defecto ve todas.
            </p>
            {error ? <p className="mt-4 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-100">{error}</p> : null}

            <div className="mt-5 space-y-5">
              {modulosConPantallasDe(pantallasUser).map((modulo) => (
                <div key={modulo}>
                  <p className="text-sm font-medium text-[#CFCFCB]">
                    {modulo === "shipping-v2" ? "Shipping" : modulo}
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {PANTALLAS_POR_MODULO[modulo].map((pantalla) => (
                      <label key={pantalla.key} className="flex items-center gap-3 rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2 text-sm text-[#CFCFCB]">
                        <input
                          type="checkbox"
                          checked={pantallasForm[modulo]?.has(pantalla.key) ?? true}
                          onChange={() => togglePantalla(modulo, pantalla.key)}
                          className="h-4 w-4 accent-[#D7FF4F]"
                        />
                        {pantalla.label}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-4 text-xs text-[#A7A7A7]">
              El cambio aplica la próxima vez que {pantallasUser.nombre.split(" ")[0]} inicie sesión, no de inmediato.
            </p>

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={closeModals} className="rounded-full border border-[#3A3A36] px-4 py-2 text-sm font-medium text-[#CFCFCB] transition hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F]">Cancelar</button>
              <button type="button" disabled={isSubmitting} onClick={handlePantallasSave} className="rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-4 py-2 text-sm font-semibold text-[#10110E] transition hover:brightness-105 disabled:opacity-60">
                {isSubmitting ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {camposUser ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 px-4 py-8 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[1rem] border border-[#3A3A36] bg-[#252622] p-5 text-left shadow-2xl shadow-black">
            <h2 className="text-xl font-semibold text-[#F5F5F5]">Campos por pantalla</h2>
            <p className="mt-1 text-sm text-[#A7A7A7]">
              {camposUser.nombre} — "Cantidad" no aparece aquí: siempre requiere Administrador, sin excepción.
            </p>
            {error ? <p className="mt-4 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-100">{error}</p> : null}

            <div className="mt-5 space-y-5">
              {pantallasConCamposDe(camposUser).map(({ modulo, pantalla, label, campos }) => {
                const clave = `${modulo}::${pantalla}`;
                return (
                  <div key={clave}>
                    <p className="text-sm font-medium text-[#CFCFCB]">
                      {modulo === "shipping-v2" ? "Shipping" : modulo} · {label}
                    </p>
                    <div className="mt-2 divide-y divide-[#3A3A36] rounded-lg border border-[#3A3A36]">
                      {campos.map((campo) => (
                        <div key={campo.key} className="flex items-center justify-between gap-3 px-3 py-2">
                          <span className="text-sm text-[#CFCFCB]">{campo.label}</span>
                          <select
                            value={camposForm[clave]?.[campo.key] ?? "editable"}
                            onChange={(event) => setCampoEstado(clave, campo.key, event.target.value as EstadoCampoPersonalizado | "editable")}
                            className="rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-2 py-1.5 text-xs text-[#F5F5F5] focus:border-[#D7FF4F]/70 focus:outline-none"
                          >
                            <option value="editable">Editable</option>
                            <option value="solo-lectura">Solo lectura</option>
                            <option value="oculto">Oculto</option>
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="mt-4 text-xs text-[#A7A7A7]">
              El cambio aplica la próxima vez que {camposUser.nombre.split(" ")[0]} inicie sesión, no de inmediato.
            </p>

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={closeModals} className="rounded-full border border-[#3A3A36] px-4 py-2 text-sm font-medium text-[#CFCFCB] transition hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F]">Cancelar</button>
              <button type="button" disabled={isSubmitting} onClick={handleCamposSave} className="rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-4 py-2 text-sm font-semibold text-[#10110E] transition hover:brightness-105 disabled:opacity-60">
                {isSubmitting ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

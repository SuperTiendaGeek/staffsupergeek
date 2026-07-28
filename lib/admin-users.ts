import "server-only";

import { isAdministratorRole, isProviderRole, staffApps } from "@/lib/apps";
import type { PortalUser, PortalUserInput } from "@/types/admin-users";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const allowedApps = new Set<string>(
  staffApps.filter((app) => app.id !== "usuarios").map((app) => app.permissionName)
);

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function parsePortalUserInput(payload: Record<string, unknown> | null): { input?: PortalUserInput; error?: string } {
  const nombre = typeof payload?.nombre === "string" ? payload.nombre.trim() : "";
  const email = typeof payload?.email === "string" ? normalizeEmail(payload.email) : "";
  const rol = typeof payload?.rol === "string" ? payload.rol.trim() : "";
  const activo = typeof payload?.activo === "boolean" ? payload.activo : true;
  const requiere2FA = typeof payload?.requiere2FA === "boolean" ? payload.requiere2FA : false;

  if (!email) {
    return { error: "El correo es obligatorio" };
  }

  if (!emailPattern.test(email)) {
    return { error: "El correo no tiene un formato valido" };
  }

  if (!rol) {
    return { error: "El rol es obligatorio" };
  }

  if (!Array.isArray(payload?.appsPermitidas)) {
    return { error: "Las apps permitidas deben enviarse como lista" };
  }

  const appsPermitidas = payload.appsPermitidas
    .filter((app): app is string => typeof app === "string")
    .map((app) => app.trim())
    .filter(Boolean);

  if (appsPermitidas.length !== payload.appsPermitidas.length) {
    return { error: "Las apps permitidas tienen valores invalidos" };
  }

  const invalidApp = appsPermitidas.find((app) => !allowedApps.has(app));

  if (invalidApp) {
    return { error: `La app "${invalidApp}" no es valida` };
  }

  if (isProviderRole(rol)) {
    if (!appsPermitidas.includes("Shipping")) {
      return { error: "Un proveedor debe tener acceso a Shipping." };
    }

    const invalidProviderApp = appsPermitidas.find((app) => app !== "Shipping");
    if (invalidProviderApp) {
      return { error: "Un proveedor solo puede tener acceso a Shipping." };
    }
  }

  return {
    input: {
      nombre: nombre || email,
      email,
      rol,
      appsPermitidas,
      activo,
      requiere2FA
    }
  };
}

export function getActiveAdminCount(users: PortalUser[]) {
  return users.filter((user) => user.activo && isAdministratorRole(user.rol)).length;
}

export function wouldRemoveAdminAccess(user: PortalUser, input: Pick<PortalUserInput, "activo" | "rol">) {
  return user.activo && isAdministratorRole(user.rol) && (!input.activo || !isAdministratorRole(input.rol));
}

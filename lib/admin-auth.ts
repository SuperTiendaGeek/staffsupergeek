import "server-only";

import { NextResponse } from "next/server";
import { isAdministratorRole } from "@/lib/apps";
import { getSessionFromCookie, type StaffSession } from "@/lib/session";

export async function getAdminSession() {
  const session = await getSessionFromCookie();

  if (!session || !isAdministratorRole(session.user.rol)) {
    return null;
  }

  return session;
}

export async function requireAdminSession(): Promise<
  { session: StaffSession; response: null } | { session: null; response: NextResponse }
> {
  const session = await getSessionFromCookie();

  if (!session) {
    return {
      session: null,
      response: NextResponse.json({ success: false, error: "No autenticado" }, { status: 401 })
    };
  }

  if (!isAdministratorRole(session.user.rol)) {
    return {
      session: null,
      response: NextResponse.json({ success: false, error: "Acceso denegado: se requiere rol Administrador" }, { status: 403 })
    };
  }

  return { session, response: null };
}

import "server-only";

import { NextResponse } from "next/server";
import { canAccessApp, isAdministratorRole } from "@/lib/apps";
import { getSessionFromCookie } from "@/lib/session";

export async function requireFacturacionSession() {
  const session = await getSessionFromCookie();

  if (!session) {
    return {
      response: NextResponse.json({ success: false, error: "No autenticado" }, { status: 401 }),
      session: null,
    };
  }

  if (!canAccessApp(session, "Facturación")) {
    return {
      response: NextResponse.json({ success: false, error: "Acceso denegado" }, { status: 403 }),
      session: null,
    };
  }

  return { response: null, session };
}

/**
 * Como requireFacturacionSession(), pero además exige rol de administrador.
 *
 * Para operaciones de configuración del módulo —hoy, cargar la firma
 * electrónica— que un usuario de facturación no debe poder ejecutar aunque
 * tenga permiso para emitir. Cambiar la firma cambia con qué identidad
 * tributaria se firma TODO lo que emita el negocio.
 */
export async function requireFacturacionAdmin() {
  const { response, session } = await requireFacturacionSession();
  if (response || !session) return { response, session: null };

  if (!isAdministratorRole(session.user.rol)) {
    return {
      response: NextResponse.json(
        { success: false, error: "Solo un administrador puede cambiar la firma electrónica." },
        { status: 403 }
      ),
      session: null,
    };
  }

  return { response: null, session };
}

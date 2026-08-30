import { NextResponse } from "next/server";
import { canAccessApp } from "@/lib/apps";
import { getSessionFromCookie } from "@/lib/session";

export async function requireTecnicosSession() {
  const session = await getSessionFromCookie();

  if (!session) {
    return {
      response: NextResponse.json({ success: false, error: "No autenticado" }, { status: 401 }),
      session: null,
    };
  }

  if (!canAccessApp(session, "Técnicos")) {
    return {
      response: NextResponse.json({ success: false, error: "Acceso denegado" }, { status: 403 }),
      session: null,
    };
  }

  return { response: null, session };
}

/**
 * Como requireTecnicosSession(), pero también acepta a un usuario que solo
 * tenga permiso de Facturación (sin Técnicos).
 *
 * Registrar una etiqueta de mantenimiento (tabla "Mantenimientos") se
 * dispara desde dos pantallas de módulos distintos: /tecnicos/ordenes/[id]
 * y el detalle de una factura emitida en /facturacion. El listado de
 * seguimiento (/tecnicos/mantenimientos) sigue siendo solo de Técnicos.
 */
export async function requireTecnicosOMantenimientoDesdeFacturacionSession() {
  const session = await getSessionFromCookie();

  if (!session) {
    return {
      response: NextResponse.json({ success: false, error: "No autenticado" }, { status: 401 }),
      session: null,
    };
  }

  if (!canAccessApp(session, "Técnicos") && !canAccessApp(session, "Facturación")) {
    return {
      response: NextResponse.json({ success: false, error: "Acceso denegado" }, { status: 403 }),
      session: null,
    };
  }

  return { response: null, session };
}

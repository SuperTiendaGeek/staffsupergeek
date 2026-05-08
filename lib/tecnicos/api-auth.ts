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

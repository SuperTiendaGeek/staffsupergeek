import { NextResponse } from "next/server";
import { contarNotificacionesNoLeidas } from "@/lib/notificaciones/airtable";
import { getSessionFromCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSessionFromCookie();

  if (!session) {
    return NextResponse.json({ success: false, error: "No autenticado" }, { status: 401 });
  }

  try {
    if (process.env.NODE_ENV === "development") {
      console.info("[notificaciones-api] resumen usuario autenticado", {
        user: session.user,
        idUsado: session.user.userId
      });
    }

    const unreadCount = await contarNotificacionesNoLeidas(session.user.userId);
    return NextResponse.json({ success: true, unreadCount });
  } catch (error) {
    console.error("Error al contar notificaciones:", error);
    return NextResponse.json({ success: false, error: "No se pudo cargar el resumen de notificaciones" }, { status: 500 });
  }
}

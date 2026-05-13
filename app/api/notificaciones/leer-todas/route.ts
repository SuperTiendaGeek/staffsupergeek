import { NextResponse } from "next/server";
import { marcarTodasComoLeidas } from "@/lib/notificaciones/airtable";
import { getSessionFromCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function PATCH() {
  const session = await getSessionFromCookie();

  if (!session) {
    return NextResponse.json({ success: false, error: "No autenticado" }, { status: 401 });
  }

  try {
    if (process.env.NODE_ENV === "development") {
      console.info("[notificaciones-api] marcar todas", {
        user: session.user,
        idUsado: session.user.userId
      });
    }

    const updatedCount = await marcarTodasComoLeidas(session.user.userId);
    return NextResponse.json({ success: true, updatedCount });
  } catch (error) {
    console.error("Error al marcar todas las notificaciones:", error);
    return NextResponse.json({ success: false, error: "No se pudieron marcar las notificaciones" }, { status: 500 });
  }
}

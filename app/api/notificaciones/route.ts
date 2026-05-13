import { NextResponse } from "next/server";
import { obtenerNotificacionesUsuario } from "@/lib/notificaciones/airtable";
import { getSessionFromCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSessionFromCookie();

  if (!session) {
    return NextResponse.json({ success: false, error: "No autenticado" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") || 20);

  try {
    if (process.env.NODE_ENV === "development") {
      console.info("[notificaciones-api] listado usuario autenticado", {
        user: session.user,
        idUsado: session.user.userId
      });
    }

    const notifications = await obtenerNotificacionesUsuario(session.user.userId, {
      limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 20,
      includeArchived: url.searchParams.get("archivadas") === "1"
    });

    return NextResponse.json({ success: true, notifications });
  } catch (error) {
    console.error("Error al listar notificaciones:", error);
    return NextResponse.json({ success: false, error: "No se pudieron cargar las notificaciones" }, { status: 500 });
  }
}

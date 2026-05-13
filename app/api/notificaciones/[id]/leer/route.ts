import { NextResponse } from "next/server";
import { marcarNotificacionComoLeida } from "@/lib/notificaciones/airtable";
import { getSessionFromCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ id: string }>;
};

export async function PATCH(_: Request, { params }: Params) {
  const session = await getSessionFromCookie();

  if (!session) {
    return NextResponse.json({ success: false, error: "No autenticado" }, { status: 401 });
  }

  const { id } = await params;

  try {
    if (process.env.NODE_ENV === "development") {
      console.info("[notificaciones-api] marcar leida", {
        user: session.user,
        idUsado: session.user.userId,
        notificacionId: id
      });
    }

    const notification = await marcarNotificacionComoLeida(id, session.user.userId);
    return NextResponse.json({ success: true, notification });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo marcar la notificación como leída";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

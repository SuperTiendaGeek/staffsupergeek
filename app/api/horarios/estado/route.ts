import { NextResponse } from "next/server";
import { canAccessApp } from "@/lib/apps";
import { getHorarioEstado } from "@/lib/horarios/airtable";
import { getSessionFromCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSessionFromCookie();

  if (!session) {
    return NextResponse.json({ success: false, error: "No autenticado" }, { status: 401 });
  }

  if (!canAccessApp(session, "Horarios")) {
    return NextResponse.json({ success: false, error: "Acceso denegado" }, { status: 403 });
  }

  try {
    const estado = await getHorarioEstado(session.user);
    return NextResponse.json({ success: true, estado });
  } catch (error) {
    console.error("Error al obtener estado de horarios:", error);
    return NextResponse.json({ success: false, error: "No se pudo cargar el estado del horario" }, { status: 500 });
  }
}

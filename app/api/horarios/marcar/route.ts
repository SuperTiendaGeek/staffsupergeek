import { NextResponse } from "next/server";
import { canAccessApp } from "@/lib/apps";
import { isTipoMarcacion, marcarHorario } from "@/lib/horarios/airtable";
import { getSessionFromCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

type MarcarPayload = {
  tipo?: unknown;
  observacion?: unknown;
};

function getRequestIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();

  return (
    forwardedFor ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-vercel-forwarded-for") ||
    undefined
  );
}

export async function POST(request: Request) {
  const session = await getSessionFromCookie();

  if (!session) {
    return NextResponse.json({ success: false, error: "No autenticado" }, { status: 401 });
  }

  if (!canAccessApp(session, "Horarios")) {
    return NextResponse.json({ success: false, error: "Acceso denegado" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as MarcarPayload | null;

  if (!isTipoMarcacion(body?.tipo) || body.tipo === "ajuste_admin") {
    return NextResponse.json({ success: false, error: "Tipo de marcación no válido" }, { status: 400 });
  }

  try {
    const estado = await marcarHorario(session.user, body.tipo, {
      ip: getRequestIp(request),
      userAgent: request.headers.get("user-agent") || undefined,
      observacion: typeof body?.observacion === "string" ? body.observacion.trim() : undefined
    });

    return NextResponse.json({ success: true, estado });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Error completo al marcar horario:", {
        message: error instanceof Error ? error.message : error
      });
    }

    const rawMessage = error instanceof Error ? error.message : "";
    const message = rawMessage.startsWith("Airtable horarios request failed")
      ? "Airtable rechazó la marcación. Revisa la configuración de campos de Horarios."
      : rawMessage || "No se pudo registrar la marcación";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

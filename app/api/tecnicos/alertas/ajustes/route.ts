import { NextResponse } from "next/server";
import { isAdministratorRole } from "@/lib/apps";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { ErrorAlerta, guardarConfigAlertas, leerConfigAlertas } from "@/lib/tecnicos/alertas/servidor";

// Ajustes de las alertas (rediseño R10, tablero 11): horario y tiempos por situación.
//   GET → config (todos la ven) · PUT config (solo administrador)

export const dynamic = "force-dynamic";

export async function GET() {
  const { response, session } = await requireTecnicosSession();
  if (response) return response;
  try {
    return NextResponse.json({ success: true, data: { config: await leerConfigAlertas(), esAdmin: isAdministratorRole(session.user.rol) } }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[alertas ajustes GET]", e);
    return NextResponse.json({ success: false, error: "No se pudo leer los ajustes." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const { response, session } = await requireTecnicosSession();
  if (response) return response;
  if (!isAdministratorRole(session.user.rol)) {
    return NextResponse.json({ success: false, error: "Solo un administrador cambia los ajustes de las alertas." }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  try {
    const config = await guardarConfigAlertas(body, { nombre: session.user.nombre ?? null, email: session.user.email ?? null, id: session.user.userId ?? null });
    return NextResponse.json({ success: true, data: { config } });
  } catch (e) {
    if (e instanceof ErrorAlerta) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    console.error("[alertas ajustes PUT]", e);
    return NextResponse.json({ success: false, error: "No se pudo guardar." }, { status: 500 });
  }
}

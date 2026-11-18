import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { configPantallaAdmin, guardarConfigPantalla } from "@/lib/pantalla-cliente/config-servidor";
import { validarConfig } from "@/lib/pantalla-cliente/config";

export const dynamic = "force-dynamic";

// Administrar → Pantalla del cliente (10E-C). Solo administradores.
export async function GET() {
  const { response } = await requireAdminSession();
  if (response) return response;
  try {
    return NextResponse.json({ success: true, data: await configPantallaAdmin() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[admin pantalla cliente GET]", e);
    return NextResponse.json({ success: false, error: "No se pudieron leer los ajustes." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const { session, response } = await requireAdminSession();
  if (response) return response;
  const v = validarConfig(await request.json().catch(() => null));
  if (!v.ok) return NextResponse.json({ success: false, error: v.error }, { status: 400 });
  try {
    const quien = session.user.nombre?.trim() || session.user.email || "Administrador";
    return NextResponse.json({ success: true, data: await guardarConfigPantalla(v.config, quien) });
  } catch (e) {
    console.error("[admin pantalla cliente PUT]", e);
    return NextResponse.json({ success: false, error: "No se pudieron guardar los ajustes. Intenta de nuevo." }, { status: 500 });
  }
}

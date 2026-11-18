import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/session";
import { configPantalla } from "@/lib/pantalla-cliente/config-servidor";
import { puedeUsarPantalla } from "@/lib/pantalla-cliente/config";

export const dynamic = "force-dynamic";

// Pantalla del cliente (10E-C): lo que el portal necesita saber al cargar
// (¿la puede usar esta persona?, tiempos y texto del reposo).
export async function GET() {
  const session = await getSessionFromCookie();
  if (!session) return NextResponse.json({ success: false, error: "No autenticado" }, { status: 401 });
  try {
    const c = await configPantalla();
    return NextResponse.json(
      { success: true, data: { permitido: puedeUsarPantalla(session.user.rol, c), segundosGracias: c.segundosGracias, minutosSinActividad: c.minutosSinActividad, textoReposo: c.textoReposo } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[pantalla cliente config]", e);
    return NextResponse.json({ success: false, error: "No se pudieron leer los ajustes." }, { status: 500 });
  }
}

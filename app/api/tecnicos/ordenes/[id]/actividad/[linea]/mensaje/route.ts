import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { ErrorActividad } from "@/lib/tecnicos/actividad/servidor";
import { ACCIONES_MENSAJE, accionMensaje, type AccionMensaje } from "@/lib/tecnicos/actividad/mensaje";

// Actividad v2 (24-nov): el mensaje para el cliente de UNA línea.
//   POST { accion: crear | corto | otro | talCual | guardar | enviar | descartar, texto?, via?: "WhatsApp" | "Copiado" }
//   → la línea como queda (con su mensaje)

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string; linea: string }> };

export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireTecnicosSession();
  if (response) return response;
  const { id, linea } = await params;
  const body = (await request.json().catch(() => ({}))) as { accion?: unknown; texto?: unknown; via?: unknown };
  const accion = String(body.accion ?? "") as AccionMensaje;
  if (!ACCIONES_MENSAJE.includes(accion)) return NextResponse.json({ success: false, error: "Acción no válida." }, { status: 400 });
  try {
    const data = await accionMensaje({
      ordenId: id, lineaId: linea, accion, texto: body.texto, via: body.via,
      usuario: { nombre: session.user.nombre ?? null, email: session.user.email ?? null, id: session.user.userId ?? null },
    });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    if (e instanceof ErrorActividad) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    console.error("[actividad mensaje]", e);
    return NextResponse.json({ success: false, error: "No se pudo con el mensaje. Intenta de nuevo." }, { status: 500 });
  }
}

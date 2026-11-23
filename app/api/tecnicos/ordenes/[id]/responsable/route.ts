import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { ErrorResponsable, asignarResponsable, leerResponsable } from "@/lib/tecnicos/responsable/servidor";

// Responsable de la orden (rediseño R1): selector de la cabecera.
//   GET  → { actual, opciones, yo }
//   POST → { usuarioId: "rec…" | null } (tomar, asignar o quitar; queda en la Actividad)

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { response, session } = await requireTecnicosSession();
  if (response) return response;
  const { id } = await params;
  try {
    const data = await leerResponsable(id);
    return NextResponse.json({ success: true, data: { ...data, yo: session.user.userId ?? null } }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[responsable GET]", e);
    return NextResponse.json({ success: false, error: "No se pudo leer el responsable." }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireTecnicosSession();
  if (response) return response;
  const { id } = await params;
  const body = await request.json().catch(() => null);
  try {
    const data = await asignarResponsable({
      ordenId: id,
      body,
      usuario: { nombre: session.user.nombre ?? null, email: session.user.email ?? null, id: session.user.userId ?? null },
    });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    if (e instanceof ErrorResponsable) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    console.error("[responsable POST]", e);
    return NextResponse.json({ success: false, error: "No se pudo cambiar el responsable." }, { status: 500 });
  }
}

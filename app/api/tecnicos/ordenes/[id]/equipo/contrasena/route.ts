import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { ErrorEquipo, cambiarContrasena, verContrasena } from "@/lib/tecnicos/equipos/servidor";

// Contraseña del equipo (rediseño R4): vive en la ficha, oculta.
//   POST { equipoId }         → «Mostrar»: la devuelve y queda en la Actividad
//   PUT  { equipoId, valor }  → la guarda o la cambia ("" la borra); queda en la Actividad sin el valor

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const fallo = (e: unknown) => {
  if (e instanceof ErrorEquipo) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
  console.error("[equipo/contrasena]", e);
  return NextResponse.json({ success: false, error: "No se pudo con la contraseña." }, { status: 500 });
};

export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireTecnicosSession();
  if (response) return response;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { equipoId?: unknown };
  if (typeof body.equipoId !== "string") return NextResponse.json({ success: false, error: "Falta el equipo." }, { status: 400 });
  try {
    const valor = await verContrasena({
      equipoId: body.equipoId, ordenId: id,
      usuario: { nombre: session.user.nombre ?? null, email: session.user.email ?? null, id: session.user.userId ?? null },
    });
    return NextResponse.json({ success: true, data: { contrasena: valor } }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return fallo(e);
  }
}

export async function PUT(request: Request, { params }: Params) {
  const { response, session } = await requireTecnicosSession();
  if (response) return response;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { equipoId?: unknown; valor?: unknown };
  if (typeof body.equipoId !== "string" || typeof body.valor !== "string") {
    return NextResponse.json({ success: false, error: "Faltan datos." }, { status: 400 });
  }
  try {
    await cambiarContrasena({
      equipoId: body.equipoId, ordenId: id, valor: body.valor,
      usuario: { nombre: session.user.nombre ?? null, email: session.user.email ?? null, id: session.user.userId ?? null },
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    return fallo(e);
  }
}

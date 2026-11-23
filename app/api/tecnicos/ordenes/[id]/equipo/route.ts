import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { revisarDatosEquipo } from "@/lib/tecnicos/equipos/reglas";
import { ErrorEquipo, corregirFicha, fichaDeOrden, registrarFichaDeOrden } from "@/lib/tecnicos/equipos/servidor";

// Ficha del equipo de la orden (rediseño R5).
//   GET   → ficha (sin la contraseña), sugerida desde el texto, otros equipos del cliente e historia
//   POST  → { equipoId } liga uno del cliente · { datos, contrasena? } crea la ficha y la liga
//   PATCH → { equipoId, datos } corrige la ficha

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const fallo = (e: unknown, texto: string) => {
  if (e instanceof ErrorEquipo) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
  console.error(`[equipo] ${texto}`, e);
  return NextResponse.json({ success: false, error: texto }, { status: 500 });
};

export async function GET(_request: Request, { params }: Params) {
  const { response } = await requireTecnicosSession();
  if (response) return response;
  const { id } = await params;
  try {
    return NextResponse.json({ success: true, data: await fichaDeOrden(id) });
  } catch (e) {
    return fallo(e, "No se pudo leer el equipo.");
  }
}

export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireTecnicosSession();
  if (response) return response;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { equipoId?: unknown; datos?: Record<string, unknown>; contrasena?: unknown };
  try {
    const equipoId = typeof body.equipoId === "string" && body.equipoId.startsWith("rec") ? body.equipoId : null;
    let datos = null;
    if (!equipoId) {
      const r = revisarDatosEquipo(body.datos ?? {});
      if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: 400 });
      datos = r.datos;
    }
    const ficha = await registrarFichaDeOrden({
      ordenId: id, equipoId, datos,
      contrasena: typeof body.contrasena === "string" ? body.contrasena : null,
      usuario: { nombre: session.user.nombre ?? null, email: session.user.email ?? null, id: session.user.userId ?? null },
    });
    return NextResponse.json({ success: true, data: ficha }, { status: 201 });
  } catch (e) {
    return fallo(e, "No se pudo guardar el equipo.");
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const { response } = await requireTecnicosSession();
  if (response) return response;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { equipoId?: unknown; datos?: Record<string, unknown> };
  const equipoId = typeof body.equipoId === "string" ? body.equipoId : "";
  if (!equipoId.startsWith("rec")) return NextResponse.json({ success: false, error: "Falta el equipo." }, { status: 400 });
  const r = revisarDatosEquipo(body.datos ?? {});
  if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: 400 });
  try {
    const actual = await fichaDeOrden(id);
    if (actual.ficha?.id !== equipoId) return NextResponse.json({ success: false, error: "Ese equipo no es de esta orden." }, { status: 409 });
    return NextResponse.json({ success: true, data: await corregirFicha({ equipoId, ordenId: id, datos: r.datos }) });
  } catch (e) {
    return fallo(e, "No se pudo corregir el equipo.");
  }
}

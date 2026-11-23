import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { ErrorMotivo, guardarMotivosDeOrden, motivosDeOrden } from "@/lib/tecnicos/motivos/servidor";

// Motivos de ingreso de una orden (rediseño R7).
//   GET → { motivos, ingresaPor }
//   PUT { motivoIds, clienteDice? } → guarda los chips (y lo que dijo el cliente); el cambio queda en la Actividad.

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { response } = await requireTecnicosSession();
  if (response) return response;
  const { id } = await params;
  try {
    return NextResponse.json({ success: true, data: await motivosDeOrden(id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof ErrorMotivo) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    console.error("[orden motivos GET]", e);
    return NextResponse.json({ success: false, error: "No se pudo leer el motivo de ingreso." }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: Params) {
  const { response, session } = await requireTecnicosSession();
  if (response) return response;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { motivoIds?: unknown; clienteDice?: unknown };
  try {
    const data = await guardarMotivosDeOrden({
      ordenId: id,
      motivoIds: body.motivoIds,
      clienteDice: body.clienteDice,
      usuario: { nombre: session.user.nombre ?? null, email: session.user.email ?? null, id: session.user.userId ?? null },
    });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    if (e instanceof ErrorMotivo) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    console.error("[orden motivos PUT]", e);
    return NextResponse.json({ success: false, error: "No se pudo guardar el motivo de ingreso." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { isAdministratorRole } from "@/lib/apps";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { ErrorMotivo, unirMotivos } from "@/lib/tecnicos/motivos/servidor";

// Unir un motivo en otro (rediseño R7, solo administrador): sus órdenes pasan
// al que queda y él queda desactivado con «Unido en». Nunca se borra.
//   POST { destinoId }

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireTecnicosSession();
  if (response) return response;
  if (!isAdministratorRole(session.user.rol)) {
    return NextResponse.json({ success: false, error: "Solo un administrador une motivos." }, { status: 403 });
  }
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { destinoId?: unknown };
  try {
    const data = await unirMotivos(id, body.destinoId);
    return NextResponse.json({ success: true, data });
  } catch (e) {
    if (e instanceof ErrorMotivo) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    console.error("[motivo unir]", e);
    return NextResponse.json({ success: false, error: "No se pudo unir los motivos." }, { status: 500 });
  }
}

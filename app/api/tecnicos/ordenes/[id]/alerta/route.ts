import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { ErrorAlerta, alertaDeOrden, leerConfigAlertas, posponerAlerta } from "@/lib/tecnicos/alertas/servidor";

// Alerta de una orden (rediseño R10): franja bajo la cabecera.
//   GET  → alerta (o null) + horario guardado (para los atajos de posponer)
//   POST { hasta: "aaaa-mm-dd", motivo } → posponer; queda en la Actividad.

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { response } = await requireTecnicosSession();
  if (response) return response;
  const { id } = await params;
  try {
    const [alerta, config] = await Promise.all([alertaDeOrden(id), leerConfigAlertas()]);
    return NextResponse.json({ success: true, data: alerta, horario: config.horario }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof ErrorAlerta) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    console.error("[alerta GET]", e);
    return NextResponse.json({ success: false, error: "No se pudo leer la alerta." }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireTecnicosSession();
  if (response) return response;
  const { id } = await params;
  const body = await request.json().catch(() => null);
  try {
    const data = await posponerAlerta({ ordenId: id, body, usuario: { nombre: session.user.nombre ?? null, email: session.user.email ?? null, id: session.user.userId ?? null } });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    if (e instanceof ErrorAlerta) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    console.error("[alerta POST]", e);
    return NextResponse.json({ success: false, error: "No se pudo posponer." }, { status: 500 });
  }
}

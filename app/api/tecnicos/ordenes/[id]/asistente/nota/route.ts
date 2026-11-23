import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { ErrorActividad, agregarNotaInterna } from "@/lib/tecnicos/actividad/servidor";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// «Guardar en la Actividad» del técnico experto (punto 11B; rediseño R3: antes
// iba a la «nota interna»). Lo hace la PERSONA con un toque: queda como nota
// interna en la Actividad de la orden, con su nombre y la hora.
export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireTecnicosSession();
  if (response) return response;
  const { id: ordenId } = await params;
  const body = (await request.json().catch(() => ({}))) as { texto?: unknown };
  const texto = typeof body.texto === "string" ? body.texto.trim().slice(0, 2000) : "";
  if (!texto) return NextResponse.json({ success: false, error: "No hay texto para guardar." }, { status: 400 });
  try {
    await agregarNotaInterna(ordenId, texto, { nombre: session.user.nombre ?? null, email: session.user.email ?? null, id: session.user.userId ?? null });
    return NextResponse.json({ success: true, data: { anotado: true } });
  } catch (error) {
    const status = error instanceof ErrorActividad ? error.status : 500;
    console.error("[asistente/nota]", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status });
  }
}

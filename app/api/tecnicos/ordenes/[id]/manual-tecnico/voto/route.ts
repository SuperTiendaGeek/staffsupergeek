import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { ErrorManual, votarSolucion } from "@/lib/manual-tecnico/servidor";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// «¿Lo probaste? Funcionó / No funcionó» (punto 11B, «reusar es revisar»).
// Suma al contador de la solución, lo anota en la nota interna de la orden y,
// si no funcionó, la deja «Para revisar» con aviso al administrador.
export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireTecnicosSession();
  if (response) return response;
  const { id: ordenId } = await params;
  const body = (await request.json().catch(() => ({}))) as { entradaId?: unknown; funciono?: unknown };
  const entradaId = typeof body.entradaId === "string" ? body.entradaId : "";
  if (!/^rec[A-Za-z0-9]{14}$/.test(entradaId) || typeof body.funciono !== "boolean") {
    return NextResponse.json({ success: false, error: "Falta la solución o la respuesta." }, { status: 400 });
  }
  try {
    const r = await votarSolucion({ entradaId, ordenId, funciono: body.funciono, usuario: session.user.nombre || session.user.email || "" });
    return NextResponse.json({
      success: true,
      data: {
        yaEstaba: r.yaEstaba,
        anotado: r.anotado,
        vecesFunciono: r.entrada.vecesFunciono,
        vecesFallo: r.entrada.vecesFallo,
        estado: r.entrada.estado,
      },
    });
  } catch (error) {
    const status = error instanceof ErrorManual ? error.status : 500;
    console.error("[manual-tecnico/voto]", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status });
  }
}

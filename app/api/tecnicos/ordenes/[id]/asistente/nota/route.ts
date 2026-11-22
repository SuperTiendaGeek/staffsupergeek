import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { ErrorManual, agregarANotaInterna } from "@/lib/manual-tecnico/servidor";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// «Pasar a nota interna» del técnico experto (punto 11B). Lo hace la PERSONA
// con un toque: agrega una línea fechada a la nota interna, nunca la reemplaza.
export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireTecnicosSession();
  if (response) return response;
  const { id: ordenId } = await params;
  const body = (await request.json().catch(() => ({}))) as { texto?: unknown };
  const texto = typeof body.texto === "string" ? body.texto.trim().slice(0, 4000) : "";
  if (!texto) return NextResponse.json({ success: false, error: "No hay texto para pasar." }, { status: 400 });
  try {
    const notaInterna = await agregarANotaInterna(ordenId, texto, session.user.nombre || session.user.email || "");
    return NextResponse.json({ success: true, data: { notaInterna } });
  } catch (error) {
    const status = error instanceof ErrorManual ? error.status : 500;
    console.error("[asistente/nota]", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status });
  }
}

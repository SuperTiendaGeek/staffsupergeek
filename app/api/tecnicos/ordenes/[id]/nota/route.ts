import { NextResponse } from "next/server";
import { updateOrdenNotaInterna } from "@/lib/tecnicos/airtable";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id: ordenRecordId } = await params;

  if (!ordenRecordId) {
    return NextResponse.json(
      { success: false, error: "Falta el id de la orden" },
      { status: 400 }
    );
  }

  let body: { notaInterna?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "JSON inválido" },
      { status: 400 }
    );
  }

  const notaInterna = (body.notaInterna ?? "").trim();
  if (notaInterna === "") {
    return NextResponse.json(
      { success: false, error: "La nota interna no puede estar vacía" },
      { status: 400 }
    );
  }

  try {
    const result = await updateOrdenNotaInterna({ ordenRecordId, notaInterna });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("Error al actualizar nota interna en Airtable:", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

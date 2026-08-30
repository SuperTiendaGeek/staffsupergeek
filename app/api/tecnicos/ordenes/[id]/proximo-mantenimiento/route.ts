import { NextResponse } from "next/server";
import { updateOrdenProximoMantenimiento } from "@/lib/tecnicos/airtable";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const FECHA_ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function PATCH(request: Request, { params }: Params) {
  const { id: ordenRecordId } = await params;

  if (!ordenRecordId) {
    return NextResponse.json(
      { success: false, error: "Falta el id de la orden" },
      { status: 400 }
    );
  }

  let body: { fecha?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "JSON inválido" },
      { status: 400 }
    );
  }

  const fecha = (body.fecha ?? "").trim();
  if (!FECHA_ISO_RE.test(fecha)) {
    return NextResponse.json(
      { success: false, error: "Fecha inválida (se espera AAAA-MM-DD)" },
      { status: 400 }
    );
  }

  try {
    const result = await updateOrdenProximoMantenimiento({ ordenRecordId, fecha });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("Error al actualizar próximo mantenimiento en Airtable:", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { marcarMantenimientoNotificado } from "@/lib/tecnicos/airtable";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id: ordenRecordId } = await params;

  const { response } = await requireTecnicosSession();
  if (response) return response;

  if (!ordenRecordId) {
    return NextResponse.json(
      { success: false, error: "Falta el id de la orden" },
      { status: 400 }
    );
  }

  let body: { notificado?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "JSON inválido" }, { status: 400 });
  }

  if (typeof body.notificado !== "boolean") {
    return NextResponse.json(
      { success: false, error: "Falta 'notificado' (boolean)" },
      { status: 400 }
    );
  }

  try {
    const result = await marcarMantenimientoNotificado({
      ordenRecordId,
      notificado: body.notificado,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("Error al actualizar 'Mantenimiento Notificado' en Airtable:", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

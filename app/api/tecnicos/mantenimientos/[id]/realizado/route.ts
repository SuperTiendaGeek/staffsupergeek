import { NextResponse } from "next/server";
import { marcarMantenimientoRealizado } from "@/lib/tecnicos/airtable";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// id = record id en la tabla "Mantenimientos". Distinto de "notificado":
// esto marca que el cliente efectivamente trajo el equipo y se le hizo el
// mantenimiento de este ciclo.
export async function PATCH(request: Request, { params }: Params) {
  const { id: mantenimientoRecordId } = await params;

  const { response } = await requireTecnicosSession();
  if (response) return response;

  if (!mantenimientoRecordId) {
    return NextResponse.json({ success: false, error: "Falta el id del mantenimiento" }, { status: 400 });
  }

  let body: { realizado?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "JSON inválido" }, { status: 400 });
  }

  if (typeof body.realizado !== "boolean") {
    return NextResponse.json({ success: false, error: "Falta 'realizado' (boolean)" }, { status: 400 });
  }

  try {
    const result = await marcarMantenimientoRealizado({ mantenimientoRecordId, realizado: body.realizado });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("Error al actualizar 'Realizado' en Airtable:", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

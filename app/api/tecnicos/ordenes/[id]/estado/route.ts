import { NextResponse } from "next/server";
import { ESTADOS_ORDEN, EstadoOrden } from "@/types/tecnicos";
import { updateOrdenEstado } from "@/lib/tecnicos/airtable";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id: ordenRecordId } = await params;

  const { response, session } = await requireTecnicosSession();
  if (response) return response;

  if (!ordenRecordId) {
    return NextResponse.json(
      { success: false, error: "Falta el id de la orden" },
      { status: 400 }
    );
  }

  let body: { estado?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "JSON inválido" },
      { status: 400 }
    );
  }

  const estado = (body.estado ?? "").trim();
  if (!estado) {
    return NextResponse.json(
      { success: false, error: "Falta el estado a guardar" },
      { status: 400 }
    );
  }

  const estadoNormalizado = estado as EstadoOrden;
  if (!ESTADOS_ORDEN.includes(estadoNormalizado)) {
    return NextResponse.json(
      { success: false, error: "Estado no permitido" },
      { status: 400 }
    );
  }

  try {
    const result = await updateOrdenEstado({
      ordenRecordId,
      nuevoEstado: estadoNormalizado,
      creadoPorNombre: session.user.nombre ?? null,
      creadoPorEmail: session.user.email ?? null,
      creadoPorUsuarioId: session.user.userId ?? null,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("Error al actualizar estado en Airtable:", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

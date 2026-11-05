import { NextResponse } from "next/server";
import { ESTADOS_ORDEN, EstadoOrden } from "@/types/tecnicos";
import { updateOrdenEstado } from "@/lib/tecnicos/airtable";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { sincronizarGarantiasDeLaOrden } from "@/lib/garantias/servidor";

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

    // Garantía SUPER GEEK (auditoría ops, punto 20): al entregar, las piezas
    // en garantía salen del inventario; si la orden se reabre, vuelven
    // apartadas. Nunca frena el cambio de estado: lo que falle vuelve como aviso.
    const garantias = await sincronizarGarantiasDeLaOrden({
      ordenId: ordenRecordId,
      nuevoEstado: estadoNormalizado,
      marca: result.historial?.id || new Date().toISOString(),
      hechoPor: session.user.nombre || session.user.email || "Portal",
    });

    return NextResponse.json({ success: true, data: { ...result, garantias } });
  } catch (error) {
    console.error("Error al actualizar estado en Airtable:", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

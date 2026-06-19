import { NextResponse } from "next/server";
import { fetchOrdenById, markOrdenBajaInterna } from "@/lib/tecnicos/airtable";
import { getAbandonmentStatus } from "@/lib/tecnicos/orders/abandonmentPolicy";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(_: Request, { params }: Params) {
  const { id: ordenRecordId } = await params;

  const { response, session } = await requireTecnicosSession();
  if (response) return response;

  if (!ordenRecordId) {
    return NextResponse.json(
      { success: false, error: "Falta el id de la orden" },
      { status: 400 }
    );
  }

  try {
    const orden = await fetchOrdenById(ordenRecordId);
    if (!orden) {
      return NextResponse.json(
        { success: false, error: "Orden no encontrada" },
        { status: 404 }
      );
    }

    const abandonmentStatus = getAbandonmentStatus(orden);
    if (abandonmentStatus.level !== "critical" || abandonmentStatus.daysWaiting === null) {
      return NextResponse.json(
        { success: false, error: "La orden aún no cumple la política de baja interna" },
        { status: 409 }
      );
    }

    const result = await markOrdenBajaInterna({
      ordenRecordId,
      daysWaiting: abandonmentStatus.daysWaiting,
      creadoPorNombre: session.user.nombre ?? null,
      creadoPorEmail: session.user.email ?? null,
      creadoPorUsuarioId: session.user.userId ?? null,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("Error al marcar baja interna en Airtable:", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

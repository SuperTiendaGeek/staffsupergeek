import { NextResponse } from "next/server";
import { updateCotizacionEstado } from "@/lib/cotizaciones/airtable";
import { requireCotizacionesSession } from "@/lib/cotizaciones/auth";
import { ESTADOS_COTIZACION } from "@/types/cotizaciones";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { response } = await requireCotizacionesSession();
  if (response) return response;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const estado = String(body?.estado ?? "").trim();

  if (!ESTADOS_COTIZACION.includes(estado as (typeof ESTADOS_COTIZACION)[number])) {
    return NextResponse.json({ success: false, error: "Estado inválido." }, { status: 400 });
  }

  try {
    const data = await updateCotizacionEstado(id, estado);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error al actualizar estado de cotización:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

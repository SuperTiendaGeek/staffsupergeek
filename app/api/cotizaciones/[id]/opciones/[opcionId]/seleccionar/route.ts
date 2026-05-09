import { NextResponse } from "next/server";
import { seleccionarOpcionCotizacion } from "@/lib/cotizaciones/airtable";
import { requireCotizacionesSession } from "@/lib/cotizaciones/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; opcionId: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { response } = await requireCotizacionesSession();
  if (response) return response;

  const { id, opcionId } = await params;

  try {
    const data = await seleccionarOpcionCotizacion(id, opcionId);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error al seleccionar opción de cotización:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { anularOEliminarAbonoCotizacion } from "@/lib/cotizaciones/airtable";
import { requireCotizacionesSession } from "@/lib/cotizaciones/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const { response } = await requireCotizacionesSession();
  if (response) return response;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, error: "Falta id del abono." }, { status: 400 });
  }

  try {
    const data = await anularOEliminarAbonoCotizacion(id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error al anular/eliminar abono de cotización:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

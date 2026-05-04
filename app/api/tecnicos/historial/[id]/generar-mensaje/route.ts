import { NextResponse } from "next/server";
import { updateHistorialSolicitarMensaje } from "@/lib/tecnicos/airtable";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(_: Request, { params }: Params) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ success: false, error: "Falta id de historial" }, { status: 400 });
  }

  try {
    const result = await updateHistorialSolicitarMensaje({ historialRecordId: id });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("Error al solicitar mensaje cliente en historial", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

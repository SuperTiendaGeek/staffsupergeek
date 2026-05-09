import { NextResponse } from "next/server";
import { convertirCotizacionEnPedido } from "@/lib/cotizaciones/airtable";
import { requireCotizacionesSession } from "@/lib/cotizaciones/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { response } = await requireCotizacionesSession();
  if (response) return response;

  const { id } = await params;

  try {
    const data = await convertirCotizacionEnPedido(id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error al convertir cotización en pedido:", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    const status = message.includes("ya fue convertida") ? 409 : 400;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

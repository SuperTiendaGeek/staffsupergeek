import { NextResponse } from "next/server";
import { fetchCotizacionById, deleteCotizacionIfSafe } from "@/lib/cotizaciones/airtable";
import { requireCotizacionesSession } from "@/lib/cotizaciones/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Params) {
  const { response } = await requireCotizacionesSession();
  if (response) return response;

  const { id } = await params;
  const cotizacion = await fetchCotizacionById(id).catch(() => null);
  if (!cotizacion) {
    return NextResponse.json({ success: false, error: "Cotización no encontrada." }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: cotizacion });
}

export async function DELETE(_: Request, { params }: Params) {
  const { response } = await requireCotizacionesSession();
  if (response) return response;

  const { id } = await params;

  try {
    const result = await deleteCotizacionIfSafe(id);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado.";
    const status = message.includes("no encontrada") ? 404 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

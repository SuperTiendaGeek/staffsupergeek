import { NextResponse } from "next/server";
import { requireCotizacionesSession } from "@/lib/cotizaciones/auth";
import { buscarClientes } from "@/lib/tecnicos/airtable";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { response } = await requireCotizacionesSession();
  if (response) return response;

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ success: true, data: [] });
  }

  try {
    const data = await buscarClientes({ q, pageSize: 8 });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error al buscar clientes para cotizaciones:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

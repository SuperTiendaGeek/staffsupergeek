import { NextResponse } from "next/server";
import { fetchProductosDigitalesDisponibles } from "@/lib/tecnicos/airtable";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { response } = await requireTecnicosSession();
  if (response) return response;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? undefined;

  try {
    const productos = await fetchProductosDigitalesDisponibles(q);
    return NextResponse.json({ success: true, data: productos });
  } catch (error) {
    console.error("Error al buscar productos digitales:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener productos digitales" },
      { status: 500 }
    );
  }
}

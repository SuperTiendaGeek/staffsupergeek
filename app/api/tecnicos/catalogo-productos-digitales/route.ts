import { NextResponse } from "next/server";
import { fetchCatalogoProductosDigitales } from "@/lib/tecnicos/airtable";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";

export const dynamic = "force-dynamic";

// GET /api/tecnicos/catalogo-productos-digitales?q=texto&activo=true
export async function GET(request: Request) {
  const { response } = await requireTecnicosSession();
  if (response) return response;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? undefined;
  const activoParam = searchParams.get("activo");
  const activoOnly = activoParam !== "false";

  try {
    const data = await fetchCatalogoProductosDigitales({ query: q, activoOnly });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error al obtener catálogo de productos digitales:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener catálogo" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { fetchMantenimientosProximos } from "@/lib/tecnicos/airtable";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const { response } = await requireTecnicosSession();
  if (response) return response;

  try {
    const data = await fetchMantenimientosProximos();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error al listar mantenimientos próximos desde Airtable:", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

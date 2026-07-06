import { NextResponse } from "next/server";
import { buscarRepuestosStockDisponibles } from "@/lib/tecnicos/repuestos-v2";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";

export const dynamic = "force-dynamic";

// GET /api/tecnicos/ordenes/[id]/repuestos-v2/buscar?q=texto
// Busca items de Shipping Items categoría Repuesto, disponibles y sin reservar.
export async function GET(request: Request) {
  const { response } = await requireTecnicosSession();
  if (response) return response;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? undefined;

  try {
    const data = await buscarRepuestosStockDisponibles(q);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error al buscar repuestos de stock:", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

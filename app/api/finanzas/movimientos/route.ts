import { NextResponse } from "next/server";
import { requireFinanzasSession } from "@/lib/finanzas/auth";
import { listarMovimientos } from "@/lib/finanzas/movimientos";
import type { CategoriaMovimiento, EstadoMovimiento, TipoMovimiento } from "@/types/finanzas";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { response } = await requireFinanzasSession();
  if (response) return response;

  try {
    const { searchParams } = new URL(request.url);
    const movimientos = await listarMovimientos({
      tipo: (searchParams.get("tipo") as TipoMovimiento) || undefined,
      categoria: (searchParams.get("categoria") as CategoriaMovimiento) || undefined,
      estado: (searchParams.get("estado") as EstadoMovimiento) || undefined,
      desde: searchParams.get("desde") || undefined,
      hasta: searchParams.get("hasta") || undefined,
      maxRecords: 200,
    });
    return NextResponse.json({ success: true, data: movimientos });
  } catch (error) {
    console.error("Error al listar movimientos financieros:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 500 });
  }
}

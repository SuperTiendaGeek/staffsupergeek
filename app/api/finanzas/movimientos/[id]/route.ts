import { NextResponse } from "next/server";
import { requireFinanzasSession } from "@/lib/finanzas/auth";
import { fetchMovimientoConTrazabilidad } from "@/lib/finanzas/trazabilidad";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { response } = await requireFinanzasSession();
  if (response) return response;

  const { id } = await params;

  try {
    const resultado = await fetchMovimientoConTrazabilidad(id);
    if (!resultado) {
      return NextResponse.json({ success: false, error: `Movimiento ${id} no encontrado.` }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: resultado });
  } catch (error) {
    console.error("Error al cargar el detalle del movimiento financiero:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 500 });
  }
}

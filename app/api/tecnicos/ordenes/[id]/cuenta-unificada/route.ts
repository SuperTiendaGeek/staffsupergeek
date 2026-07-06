import { NextResponse } from "next/server";
import { getCuentaUnificada } from "@/lib/cuenta-unificada";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// GET /api/tecnicos/ordenes/[id]/cuenta-unificada
export async function GET(_request: Request, { params }: Params) {
  const { response } = await requireTecnicosSession();
  if (response) return response;

  const { id: ordenId } = await params;
  if (!ordenId) {
    return NextResponse.json({ success: false, error: "Falta el id de la orden" }, { status: 400 });
  }

  try {
    const data = await getCuentaUnificada({ ordenId });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error al obtener la cuenta unificada:", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getCuentaUnificada } from "@/lib/cuenta-unificada";
import { requireOperacionesSession } from "@/lib/operaciones/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// GET /api/operaciones/[id]/cuenta-unificada
export async function GET(_request: Request, { params }: Params) {
  const { response } = await requireOperacionesSession();
  if (response) return response;

  const { id: operacionId } = await params;
  if (!operacionId) {
    return NextResponse.json({ success: false, error: "Falta el id de la operación" }, { status: 400 });
  }

  try {
    const data = await getCuentaUnificada({ operacionId });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error al obtener la cuenta unificada:", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

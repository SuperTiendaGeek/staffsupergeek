import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { responderParteDePago } from "@/lib/parte-pago/ruta";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// POST: el cliente deja un artículo como parte de pago de la orden.
export async function POST(request: Request, { params }: Params) {
  const { session, response } = await requireTecnicosSession();
  if (response || !session) return response ?? NextResponse.json({ success: false }, { status: 401 });
  const { id } = await params;
  return responderParteDePago(request, { tipo: "orden", recordId: id }, session);
}

import { NextResponse } from "next/server";
import { requireOperacionesSession } from "@/lib/operaciones/auth";
import { responderParteDePago } from "@/lib/parte-pago/ruta";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// POST: el cliente deja un artículo como parte de pago del pedido.
export async function POST(request: Request, { params }: Params) {
  const { session, response } = await requireOperacionesSession();
  if (response || !session) return response ?? NextResponse.json({ success: false }, { status: 401 });
  const { id } = await params;
  return responderParteDePago(request, { tipo: "operacion", recordId: id }, session);
}

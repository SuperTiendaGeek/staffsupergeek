import { NextResponse } from "next/server";
import { requireOperacionesSession } from "@/lib/operaciones/auth";
import { solicitudesDeOperacion } from "@/lib/compras/servidor";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Fase 2: la situación de la compra de un pedido de cliente (chip en el pedido).
export async function GET(_: Request, { params }: Params) {
  const { session, response } = await requireOperacionesSession();
  if (response || !session) return response ?? NextResponse.json({ success: false }, { status: 401 });
  const { id } = await params;
  try {
    const solicitudes = await solicitudesDeOperacion(id);
    return NextResponse.json({
      success: true,
      data: solicitudes.map((s) => ({ id: s.id, codigo: s.codigo, estado: s.estado, situacion: s.situacion })),
    });
  } catch (e) {
    console.error("[api/operaciones/[id]/compras]", e);
    return NextResponse.json({ success: false, error: "No se pudo leer la compra." }, { status: 503 });
  }
}

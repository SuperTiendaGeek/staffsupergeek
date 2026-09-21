import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { marcarPedidoAlProveedor } from "@/lib/tecnicos/presupuesto/cargar";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string; lineaId: string }> };

// POST — "Ya se pidió al proveedor": la operación pasa a Pedido y nace el
// artículo en Shipping Items (pago y recepción pendientes).
export async function POST(_req: Request, { params }: Params) {
  const { response, session } = await requireTecnicosSession();
  if (response || !session) return response ?? NextResponse.json({ success: false, error: "Sin sesión" }, { status: 401 });
  const { id, lineaId } = await params;
  try {
    const r = await marcarPedidoAlProveedor({ ordenId: id, lineaId, usuario: { nombre: session.user.nombre || session.user.email || "Portal" } });
    return NextResponse.json({ success: true, data: r });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "No se pudo registrar el pedido" }, { status: 409 });
  }
}

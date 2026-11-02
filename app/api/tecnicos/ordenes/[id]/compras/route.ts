import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { solicitudesDeOrden } from "@/lib/compras/servidor";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Fase 2: qué falta de cada repuesto bajo pedido de la orden (chips de la
// tarjeta Presupuesto): esperando pago, falta pedir, falta pagar al
// proveedor, en camino, llegó, entregado o cancelado.
export async function GET(_: Request, { params }: Params) {
  const { session, response } = await requireTecnicosSession();
  if (response || !session) return response ?? NextResponse.json({ success: false }, { status: 401 });
  const { id } = await params;
  try {
    const solicitudes = await solicitudesDeOrden(id);
    return NextResponse.json({
      success: true,
      data: solicitudes.map((s) => ({ id: s.id, codigo: s.codigo, lineaId: s.lineaId, estado: s.estado, sku: s.sku, situacion: s.situacion })),
    });
  } catch (e) {
    console.error("[api/tecnicos/ordenes/[id]/compras]", e);
    return NextResponse.json({ success: false, error: "No se pudo leer el estado de las compras." }, { status: 503 });
  }
}

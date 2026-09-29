import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { marcarPedidoAlProveedor } from "@/lib/tecnicos/presupuesto/cargar";
import { esLlegadaPedido } from "@/lib/operaciones/pedido";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string; lineaId: string }> };

// POST — "Ya se pidió al proveedor": la operación pasa a Pedido y nace el
// artículo en Shipping Items (pago y recepción pendientes).
export async function POST(req: Request, { params }: Params) {
  const { response, session } = await requireTecnicosSession();
  if (response || !session) return response ?? NextResponse.json({ success: false, error: "Sin sesión" }, { status: 401 });
  const { id, lineaId } = await params;
  // Unidades compradas y cómo llegan (opcional: sin cuerpo = lo de antes).
  const body = (await req.json().catch(() => ({}))) as { unidadesCompradas?: unknown; llegada?: unknown };
  const unidadesCompradas =
    body.unidadesCompradas === undefined || body.unidadesCompradas === null || body.unidadesCompradas === ""
      ? null
      : Number(body.unidadesCompradas);
  const llegada = esLlegadaPedido(body.llegada) ? body.llegada : null;
  try {
    const r = await marcarPedidoAlProveedor({
      ordenId: id,
      lineaId,
      usuario: { nombre: session.user.nombre || session.user.email || "Portal" },
      pedido: { unidadesCompradas, llegada },
    });
    return NextResponse.json({ success: true, data: r });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "No se pudo registrar el pedido" }, { status: 409 });
  }
}

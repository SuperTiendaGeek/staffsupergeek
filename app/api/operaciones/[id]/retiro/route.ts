import { NextResponse } from "next/server";
import { requireOperacionesSession } from "@/lib/operaciones/auth";
import { ErrorRetiro, liberarPedido, quitarRecargo, retiroDelPedido } from "@/lib/pedidos-especiales/retiro-servidor";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Plazos de retiro del pedido (auditoría ops, punto 10C-3b; maquetas 5a y 5b).
// GET: plazos, recargo y si está "Por liberar".
// POST { accion: "quitar_recargo", motivo } | { accion: "liberar" } — solo administradores.
export async function GET(_: Request, { params }: Params) {
  const { response, session } = await requireOperacionesSession();
  if (response || !session) return response ?? NextResponse.json({ success: false }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json({ success: true, data: await retiroDelPedido(id, session) });
  } catch (e) {
    if (e instanceof ErrorRetiro) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    console.error("[pedido/retiro]", e);
    return NextResponse.json({ success: false, error: "No se pudieron leer los plazos." }, { status: 503 });
  }
}

export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireOperacionesSession();
  if (response || !session) return response ?? NextResponse.json({ success: false }, { status: 401 });
  const { id } = await params;
  let b: Record<string, unknown> = {};
  try { b = await request.json(); } catch { return NextResponse.json({ success: false, error: "Cuerpo inválido." }, { status: 400 }); }
  try {
    if (b.accion === "quitar_recargo") {
      await quitarRecargo({ pedidoId: id, motivo: typeof b.motivo === "string" ? b.motivo.slice(0, 300) : "", session });
      return NextResponse.json({ success: true });
    }
    if (b.accion === "liberar") return NextResponse.json({ success: true, data: await liberarPedido({ pedidoId: id, session }) });
    return NextResponse.json({ success: false, error: "Acción inválida." }, { status: 400 });
  } catch (e) {
    if (e instanceof ErrorRetiro) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    console.error("[pedido/retiro]", e);
    return NextResponse.json({ success: false, error: "No se pudo completar. Intenta de nuevo." }, { status: 500 });
  }
}

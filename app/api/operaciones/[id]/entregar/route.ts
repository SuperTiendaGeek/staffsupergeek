import { NextResponse } from "next/server";
import { requireOperacionesSession } from "@/lib/operaciones/auth";
import { ErrorEntregaPedido, entregarPedido, revisarEntregaPedido } from "@/lib/pedidos-especiales/entrega-servidor";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Entregar un pedido especial (auditoría ops, punto 10C-2; maqueta 4b).
// GET: la revisión (llegó, cobro, documento). No escribe.
export async function GET(_: Request, { params }: Params) {
  const { response } = await requireOperacionesSession();
  if (response) return response;
  const { id } = await params;
  try {
    return NextResponse.json({ success: true, data: await revisarEntregaPedido(id) });
  } catch (e) {
    if (e instanceof ErrorEntregaPedido) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    console.error("[pedido/entregar] revisar", e);
    return NextResponse.json({ success: false, error: "No se pudo revisar el pedido. Intenta de nuevo." }, { status: 503 });
  }
}

// POST: entrega. El servidor vuelve a revisar todo; nadie se salta la revisión.
export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireOperacionesSession();
  if (response || !session) return response ?? NextResponse.json({ success: false }, { status: 401 });
  const { id } = await params;
  let body: Record<string, unknown> = {};
  try { body = await request.json(); } catch { /* body vacío */ }
  const s = (k: string) => (typeof body[k] === "string" ? (body[k] as string).slice(0, 300) : "");
  try {
    await entregarPedido({ pedidoId: id, retiradoPor: s("retiradoPor"), observacion: s("observacion"), usuario: session.user.nombre || session.user.email || "Portal" });
    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof ErrorEntregaPedido) return NextResponse.json({ success: false, error: e.message, faltas: e.faltas }, { status: e.status });
    console.error("[pedido/entregar]", e);
    return NextResponse.json({ success: false, error: "No se pudo entregar. Intenta de nuevo." }, { status: 500 });
  }
}

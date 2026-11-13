import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { ErrorPedidoAparte, pasarAPedidoAparte, revisarPedidoAparte } from "@/lib/pedidos-especiales/pedido-aparte-servidor";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; lineaId: string }> };

// "Pasar a pedido aparte" (auditoría ops, punto 10C-1). Cualquier empleado
// (decisión del dueño, 12-nov). GET: lo que se va a mover, sin escribir.
export async function GET(_: Request, { params }: Params) {
  const { response } = await requireTecnicosSession();
  if (response) return response;
  const { id, lineaId } = await params;
  try {
    return NextResponse.json({ success: true, data: await revisarPedidoAparte(id, lineaId) });
  } catch (e) {
    if (e instanceof ErrorPedidoAparte) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    console.error("[pedido-aparte] revisar", e);
    return NextResponse.json({ success: false, error: "No se pudo revisar la línea. Intenta de nuevo." }, { status: 503 });
  }
}

// POST: crea el pedido y mueve la línea con su dinero. El servidor revisa todo otra vez.
export async function POST(_: Request, { params }: Params) {
  const { response, session } = await requireTecnicosSession();
  if (response) return response;
  const { id, lineaId } = await params;
  try {
    const r = await pasarAPedidoAparte({ ordenId: id, lineaId, usuario: session.user.nombre || session.user.email || "Portal" });
    return NextResponse.json({ success: true, data: r });
  } catch (e) {
    if (e instanceof ErrorPedidoAparte) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    console.error("[pedido-aparte]", e);
    return NextResponse.json({ success: false, error: "No se pudo pasar a pedido aparte. Intenta de nuevo." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { updatePedido } from "@/lib/pedidos/airtable";
import { requirePedidosSession } from "@/lib/pedidos/auth";
import { normalizeCarrierPedido } from "@/types/pedidos";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { response } = await requirePedidosSession();
  if (response) return response;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const carrier = body?.carrier === "" ? "" : normalizeCarrierPedido(body?.carrier);

  if (body?.carrier && !carrier) {
    return NextResponse.json({ success: false, error: "Carrier inválido." }, { status: 400 });
  }

  try {
    const data = await updatePedido(id, {
      usaTracking: typeof body?.usaTracking === "string" ? body.usaTracking : undefined,
      ecTracking: typeof body?.ecTracking === "string" ? body.ecTracking : undefined,
      carrier,
      recibido: typeof body?.recibido === "boolean" ? body.recibido : undefined,
      recibidoEnLv: typeof body?.recibidoEnLv === "boolean" ? body.recibidoEnLv : undefined,
      notaInterna: typeof body?.notaInterna === "string" ? body.notaInterna : undefined,
      notaPublica: typeof body?.notaPublica === "string" ? body.notaPublica : undefined,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error al actualizar pedido:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

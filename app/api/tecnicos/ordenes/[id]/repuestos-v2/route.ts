import { NextResponse } from "next/server";
import { agregarRepuestoStockAOrden, quitarRepuestoStockDeOrden } from "@/lib/tecnicos/repuestos-v2";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// POST /api/tecnicos/ordenes/[id]/repuestos-v2
// Body: { itemId } — agrega un repuesto de stock a la orden (reserva el item).
export async function POST(request: Request, { params }: Params) {
  const { id: ordenRecordId } = await params;
  const { response, session } = await requireTecnicosSession();
  if (response) return response;

  if (!ordenRecordId) {
    return NextResponse.json({ success: false, error: "Falta el id de la orden" }, { status: 400 });
  }

  let body: { itemId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "JSON inválido" }, { status: 400 });
  }

  const itemId = body.itemId?.trim();
  if (!itemId) {
    return NextResponse.json({ success: false, error: "Falta el id del item" }, { status: 400 });
  }

  try {
    const data = await agregarRepuestoStockAOrden({
      ordenRecordId,
      itemId,
      registradoPor: session.user.nombre,
    });
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    const status = message.includes("no encontrada")
      ? 404
      : message.includes("Legacy") || message.includes("ya está reservado")
        ? 409
        : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

// DELETE /api/tecnicos/ordenes/[id]/repuestos-v2
// Body: { itemId } — quita el repuesto de stock de la orden (libera la reserva).
export async function DELETE(request: Request, { params }: Params) {
  const { id: ordenRecordId } = await params;
  const { response, session } = await requireTecnicosSession();
  if (response) return response;

  if (!ordenRecordId) {
    return NextResponse.json({ success: false, error: "Falta el id de la orden" }, { status: 400 });
  }

  let body: { itemId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "JSON inválido" }, { status: 400 });
  }

  const itemId = body.itemId?.trim();
  if (!itemId) {
    return NextResponse.json({ success: false, error: "Falta el id del item" }, { status: 400 });
  }

  try {
    const data = await quitarRepuestoStockDeOrden({
      ordenRecordId,
      itemId,
      registradoPor: session.user.nombre,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    const status = message.includes("no encontrada") ? 404 : message.includes("no está reservado") ? 409 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

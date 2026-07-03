import { type NextRequest, NextResponse } from "next/server";
import { requireOperacionesSession } from "@/lib/operaciones/auth";
import { updateOperacionOrden } from "@/lib/operaciones/airtable";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { response } = await requireOperacionesSession();
  if (response) return response;

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "Cuerpo inválido." }, { status: 400 });
  }

  const ordenId = typeof body.ordenId === "string" ? body.ordenId.trim() || null : null;
  if (!ordenId) {
    return NextResponse.json({ success: false, error: "ordenId requerido." }, { status: 400 });
  }

  try {
    await updateOperacionOrden(id, ordenId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[api/operaciones/[id]/orden] PATCH error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error al vincular la orden." },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { response } = await requireOperacionesSession();
  if (response) return response;

  const { id } = await params;

  try {
    await updateOperacionOrden(id, null);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[api/operaciones/[id]/orden] DELETE error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error al desvincular la orden." },
      { status: 500 }
    );
  }
}

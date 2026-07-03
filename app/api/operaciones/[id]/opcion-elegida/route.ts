import { type NextRequest, NextResponse } from "next/server";
import { requireOperacionesSession } from "@/lib/operaciones/auth";
import { setOpcionElegida } from "@/lib/operaciones/airtable";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { response } = await requireOperacionesSession();
  if (response) return response;

  const { id: operacionId } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "Cuerpo inválido." }, { status: 400 });
  }

  const opcionId = typeof body.opcionId === "string" ? body.opcionId.trim() : null;
  if (!opcionId) {
    return NextResponse.json({ success: false, error: "opcionId requerido." }, { status: 400 });
  }

  try {
    await setOpcionElegida(operacionId, opcionId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[api/operaciones/[id]/opcion-elegida] PATCH error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error al elegir la opción." },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { response } = await requireOperacionesSession();
  if (response) return response;

  const { id: operacionId } = await params;

  try {
    await setOpcionElegida(operacionId, null);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[api/operaciones/[id]/opcion-elegida] DELETE error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error al quitar la opción elegida." },
      { status: 500 }
    );
  }
}

import { type NextRequest, NextResponse } from "next/server";
import { requireOperacionesSession } from "@/lib/operaciones/auth";
import { eliminarOperacionConOpciones, anularOperacion } from "@/lib/operaciones/airtable";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { response } = await requireOperacionesSession();
  if (response) return response;

  const { id } = await params;
  try {
    await eliminarOperacionConOpciones(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al eliminar la operación.";
    const status = msg.includes("abonos") ? 409 : 500;
    console.error("[api/operaciones/[id]] DELETE error:", err);
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

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

  if (body.action !== "anular") {
    return NextResponse.json({ success: false, error: "Acción no reconocida." }, { status: 400 });
  }

  try {
    await anularOperacion(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[api/operaciones/[id]] PATCH error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error al anular la operación." },
      { status: 500 }
    );
  }
}

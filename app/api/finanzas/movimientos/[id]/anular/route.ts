import { NextResponse } from "next/server";
import { isAdministratorRole } from "@/lib/apps";
import { requireFinanzasSession } from "@/lib/finanzas/auth";
import { anularMovimiento } from "@/lib/finanzas/movimientos";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Fase 20.3 §2.3 — anulación admin-only desde el detalle de un movimiento.
// `motivo` es obligatorio aquí (más estricto que `anularMovimiento` en sí,
// que cae a un texto por defecto) porque es una acción manual desde la UI,
// no un puente automático.
export async function POST(request: Request, { params }: Params) {
  const { session, response } = await requireFinanzasSession();
  if (response) return response;
  if (!isAdministratorRole(session?.user.rol)) {
    return NextResponse.json({ success: false, error: "Acceso denegado" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const motivo = typeof body?.motivo === "string" ? body.motivo.trim() : "";
  if (!motivo) {
    return NextResponse.json({ success: false, error: "El motivo es obligatorio para anular un movimiento." }, { status: 400 });
  }

  try {
    const { movimiento, warning } = await anularMovimiento(id, motivo);
    return NextResponse.json({ success: true, data: { movimiento, warning } });
  } catch (error) {
    console.error("Error al anular movimiento financiero:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 500 });
  }
}

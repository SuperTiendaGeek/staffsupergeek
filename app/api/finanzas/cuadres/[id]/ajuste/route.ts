import { NextResponse } from "next/server";
import { isAdministratorRole } from "@/lib/apps";
import { requireFinanzasSession } from "@/lib/finanzas/auth";
import { registrarAjusteDeCuadre } from "@/lib/finanzas/cuadres";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Fase 20.4 §2.6 — admin-only, mismo patrón inline que anular/movimiento manual.
export async function POST(request: Request, { params }: Params) {
  const { session, response } = await requireFinanzasSession();
  if (response) return response;
  if (!isAdministratorRole(session?.user.rol)) {
    return NextResponse.json({ success: false, error: "Acceso denegado" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const fecha = typeof body?.fecha === "string" && body.fecha ? body.fecha : undefined;

  try {
    const registradoPor = session!.user.nombre || session!.user.email || "Portal";
    const resultado = await registrarAjusteDeCuadre(id, { fecha, registradoPor });
    return NextResponse.json({ success: true, data: resultado });
  } catch (error) {
    console.error("Error al registrar ajuste de cuadre:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 500 });
  }
}

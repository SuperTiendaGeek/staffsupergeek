import { NextResponse } from "next/server";
import { procesarAcreditacion } from "@/lib/finanzas/acreditacion";
import { requireFinanzasSession } from "@/lib/finanzas/auth";
import { PreGoLiveError } from "@/lib/finanzas/pre-go-live";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Fase 20.3 §3.6 — operativo + admin (cualquier rol con acceso a Finanzas).
export async function POST(request: Request, { params }: Params) {
  const { session, response } = await requireFinanzasSession();
  if (response) return response;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const montoNeto = Number(body?.montoNeto);
  const fecha = typeof body?.fecha === "string" && body.fecha ? body.fecha : new Date().toISOString();

  if (!(montoNeto > 0)) {
    return NextResponse.json({ success: false, error: "El monto neto debe ser mayor a 0." }, { status: 400 });
  }

  try {
    const registradoPor = session!.user.nombre || session!.user.email || "Portal";
    const resultado = await procesarAcreditacion(id, { montoNeto, fecha, registradoPor });
    return NextResponse.json({ success: true, data: resultado });
  } catch (error) {
    if (error instanceof PreGoLiveError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: 409 });
    }
    console.error("Error al acreditar movimiento financiero:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 500 });
  }
}

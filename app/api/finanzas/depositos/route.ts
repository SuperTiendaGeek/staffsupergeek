import { NextResponse } from "next/server";
import { requireFinanzasSession } from "@/lib/finanzas/auth";
import { procesarDeposito } from "@/lib/finanzas/deposito";
import { PreGoLiveError } from "@/lib/finanzas/pre-go-live";

export const dynamic = "force-dynamic";

// Fase 20.3 §4 — operativo + admin (cualquier rol con acceso a Finanzas).
export async function POST(request: Request) {
  const { session, response } = await requireFinanzasSession();
  if (response) return response;

  const body = await request.json().catch(() => ({}));
  const cuentaOrigenId = typeof body?.cuentaOrigenId === "string" ? body.cuentaOrigenId : "";
  const cuentaDestinoId = typeof body?.cuentaDestinoId === "string" ? body.cuentaDestinoId : "";
  const monto = Number(body?.monto);
  const fecha = typeof body?.fecha === "string" && body.fecha ? body.fecha : new Date().toISOString();
  const comprobanteUrl = typeof body?.comprobanteUrl === "string" ? body.comprobanteUrl : undefined;
  const observacion = typeof body?.observacion === "string" ? body.observacion : undefined;

  if (!cuentaOrigenId || !cuentaDestinoId) {
    return NextResponse.json({ success: false, error: "Cuenta Origen y Cuenta Destino son obligatorias." }, { status: 400 });
  }
  if (!(monto > 0)) {
    return NextResponse.json({ success: false, error: "El monto debe ser mayor a 0." }, { status: 400 });
  }

  try {
    const registradoPor = session!.user.nombre || session!.user.email || "Portal";
    const movimiento = await procesarDeposito({
      cuentaOrigenId,
      cuentaDestinoId,
      monto,
      fecha,
      comprobanteUrl,
      observacion,
      registradoPor,
    });
    return NextResponse.json({ success: true, data: movimiento });
  } catch (error) {
    if (error instanceof PreGoLiveError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: 409 });
    }
    console.error("Error al registrar depósito de caja:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 500 });
  }
}

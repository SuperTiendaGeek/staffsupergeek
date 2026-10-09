import { NextResponse }              from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { obtenerReservaPorId, extenderPlazoReserva } from "@/lib/facturacion/reservas/airtable";
import { PLAZOS_VALIDOS, fechaLimiteExtendida } from "@/lib/facturacion/reservas/reglas";
import { lineaHistorialReserva } from "@/lib/facturacion/reservas/liberar";
import type { PlazoReserva } from "@/lib/facturacion/reservas/types";
import { ahoraEnEcuador } from "@/lib/facturacion/fechaEcuador";

export const dynamic = "force-dynamic";

// POST /api/facturacion/reservas/[id]/extender — { dias: 7 | 15 | 30 }
// Punto 6 (9-oct-2026): una reserva vencida (o por vencer) se puede extender.
// El nuevo plazo se cuenta desde hoy (o desde la fecha límite si todavía no
// vence). Queda en el historial de la reserva.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireFacturacionSession();
  if (response) return response;
  const { id } = await params;

  const body = (await request.json().catch(() => ({}))) as { dias?: unknown };
  const dias = Number(body.dias);
  if (!PLAZOS_VALIDOS.includes(dias as PlazoReserva)) {
    return NextResponse.json({ success: false, error: "El plazo debe ser 7, 15 o 30 días" }, { status: 400 });
  }
  try {
    const reserva = await obtenerReservaPorId(id);
    if (!reserva) return NextResponse.json({ success: false, error: "Reserva no encontrada" }, { status: 404 });
    if (reserva.estado !== "Activa") return NextResponse.json({ success: false, error: `La reserva ya está ${reserva.estado.toLowerCase()}` }, { status: 400 });
    const actual = new Date(`${reserva.fechaLimite.slice(0, 10)}T00:00:00`);
    const nueva = fechaLimiteExtendida(actual, ahoraEnEcuador(), dias as PlazoReserva);
    const iso = `${nueva.getFullYear()}-${String(nueva.getMonth() + 1).padStart(2, "0")}-${String(nueva.getDate()).padStart(2, "0")}`;
    const usuario = session?.user.nombre || "Portal";
    await extenderPlazoReserva(id, iso, lineaHistorialReserva(`Plazo extendido ${dias} días: vence ${reserva.fechaLimite.slice(0, 10)} → ${iso}.`, usuario));
    return NextResponse.json({ success: true, data: { fechaLimite: iso } });
  } catch (e) {
    console.error("[reservas extender POST]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Error al extender la reserva" }, { status: 500 });
  }
}

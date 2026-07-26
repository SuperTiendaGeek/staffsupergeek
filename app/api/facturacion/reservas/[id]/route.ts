import { NextResponse }              from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { obtenerReservaPorId }       from "@/lib/facturacion/reservas/airtable";

export const dynamic = "force-dynamic";

// GET /api/facturacion/reservas/[id] — detalle completo (incluye abonos).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireFacturacionSession();
  if (response) return response;
  const { id } = await params;
  try {
    const reserva = await obtenerReservaPorId(id);
    if (!reserva) return NextResponse.json({ success: false, error: "Reserva no encontrada" }, { status: 404 });
    return NextResponse.json({ success: true, data: reserva });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Error al cargar la reserva" }, { status: 500 });
  }
}

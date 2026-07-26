import { NextResponse }              from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { obtenerReservaPorId, marcarReservaLiberada } from "@/lib/facturacion/reservas/airtable";
import { liberarItem }               from "@/lib/facturacion/reservas/efectos";
import { getFacturacionConfig }      from "@/lib/facturacion/config";

export const dynamic = "force-dynamic";

// POST /api/facturacion/reservas/[id]/liberar — libera una reserva (vencida o
// cancelada por el cliente): devuelve el ítem a disponible y deja lo abonado
// como SALDO A FAVOR del cliente.
//
// Nota contable (pendiente de validar con la contadora, como acordamos): los
// abonos ya se registraron como Ingreso; convertirlos en saldo a favor es una
// reclasificación (deuda con el cliente), no un ingreso/egreso nuevo. Por eso
// aquí solo se registra el monto del saldo a favor en la reserva; el asiento de
// reclasificación se cablea cuando se valide.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireFacturacionSession();
  if (response) return response;

  const { id } = await params;
  const reserva = await obtenerReservaPorId(id);
  if (!reserva) return NextResponse.json({ success: false, error: "Reserva no encontrada" }, { status: 404 });
  if (reserva.estado !== "Activa") return NextResponse.json({ success: false, error: `La reserva ya está ${reserva.estado.toLowerCase()}` }, { status: 400 });

  const cfg = getFacturacionConfig();
  try {
    // Devolver el ítem a disponible (best-effort; guardado a producción).
    if (reserva.shippingItemId) {
      try { await liberarItem(reserva.shippingItemId, cfg.ambiente); }
      catch (e) { console.error("[reservas liberar] inventario:", e); }
    }
    // Marcar liberada y registrar el saldo a favor (= lo abonado).
    await marcarReservaLiberada(id, reserva.totalAbonado);

    return NextResponse.json({ success: true, data: { saldoAFavor: reserva.totalAbonado } });
  } catch (e) {
    console.error("[reservas liberar POST]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Error al liberar la reserva" }, { status: 500 });
  }
}

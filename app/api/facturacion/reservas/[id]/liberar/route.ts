import { NextResponse }              from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { liberarReserva }            from "@/lib/facturacion/reservas/liberar";

export const dynamic = "force-dynamic";

// POST /api/facturacion/reservas/[id]/liberar — libera una reserva (vencida o
// cancelada por el cliente): devuelve la unidad al artículo y deja lo abonado
// como SALDO A FAVOR del cliente. Mismo camino que la liberación automática
// de las vencidas (lib/facturacion/reservas/liberar.ts).
//
// Nota contable (pendiente de validar con la contadora, como acordamos): los
// abonos ya se registraron como Ingreso; convertirlos en saldo a favor es una
// reclasificación (deuda con el cliente), no un ingreso/egreso nuevo. Por eso
// aquí solo se registra el monto del saldo a favor en la reserva; el asiento de
// reclasificación se cablea cuando se valide.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireFacturacionSession();
  if (response) return response;

  const { id } = await params;
  try {
    const r = await liberarReserva(id, { usuario: session?.user.nombre || "Portal", motivo: "Liberada a mano." });
    return NextResponse.json({ success: true, data: { saldoAFavor: r.saldoAFavor } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al liberar la reserva";
    const status = msg.includes("no encontrada") ? 404 : msg.startsWith("La reserva ya está") ? 400 : 500;
    if (status === 500) console.error("[reservas liberar POST]", e);
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

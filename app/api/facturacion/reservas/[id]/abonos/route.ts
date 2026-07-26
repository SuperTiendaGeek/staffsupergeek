import { NextResponse }              from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { obtenerReservaPorId, agregarAbonoReserva } from "@/lib/facturacion/reservas/airtable";
import { registrarIngresoAbono }     from "@/lib/facturacion/reservas/efectos";
import { validarAbono, pagoCompleto, saldoPendiente } from "@/lib/facturacion/reservas/reglas";
import { getFacturacionConfig }      from "@/lib/facturacion/config";
import { ahoraEnEcuador }            from "@/lib/facturacion/fechaEcuador";

export const dynamic = "force-dynamic";

// POST /api/facturacion/reservas/[id]/abonos — registra un abono adicional.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireFacturacionSession();
  if (response || !session) return response ?? NextResponse.json({ success: false, error: "Sin sesión" }, { status: 401 });

  const { id } = await params;
  let body: { monto?: number; formaPago?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, error: "Body JSON inválido" }, { status: 400 }); }

  const monto = Number(body.monto);
  const formaPago = body.formaPago?.trim();
  if (!formaPago) return NextResponse.json({ success: false, error: "Elige una forma de pago" }, { status: 400 });

  const reserva = await obtenerReservaPorId(id);
  if (!reserva) return NextResponse.json({ success: false, error: "Reserva no encontrada" }, { status: 404 });
  if (reserva.estado !== "Activa") return NextResponse.json({ success: false, error: `La reserva está ${reserva.estado.toLowerCase()}; no admite más abonos` }, { status: 400 });

  const err = validarAbono(monto, reserva.precio, reserva.totalAbonado);
  if (err) return NextResponse.json({ success: false, error: err }, { status: 400 });

  const registradoPor = session.user.nombre || "Portal";
  const abono = { monto, fecha: ahoraEnEcuador().toISOString(), formaPago, registradoPor };

  try {
    const { totalAbonado } = await agregarAbonoReserva(id, abono, reserva.abonos, reserva.cliente, reserva.totalAbonado);

    // Ingreso del abono (best-effort, guardado a producción).
    try { await registrarIngresoAbono({ numeroReserva: reserva.numero, monto, formaPago, clienteRecordId: reserva.clienteRecordId, registradoPor, ambiente: getFacturacionConfig().ambiente }); }
    catch (e) { console.error("[reservas abono] ingreso:", e); }

    return NextResponse.json({ success: true, data: { totalAbonado, saldoPendiente: saldoPendiente(reserva.precio, totalAbonado), pagoCompleto: pagoCompleto(reserva.precio, totalAbonado) } });
  } catch (e) {
    console.error("[reservas abono POST]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Error al registrar el abono" }, { status: 500 });
  }
}

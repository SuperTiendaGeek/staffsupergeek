import { NextResponse }              from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { obtenerReservaPorId, agregarAbonoReserva } from "@/lib/facturacion/reservas/airtable";
import { registrarAbonoReserva }     from "@/lib/facturacion/reservas/efectos";
import { validarAbono, pagoCompleto, saldoPendiente } from "@/lib/facturacion/reservas/reglas";

import { ahoraEnEcuador }            from "@/lib/facturacion/fechaEcuador";
import { codigoSriDeMetodo, mensajeCobroInvalido } from "@/lib/cobros/metodos";

export const dynamic = "force-dynamic";

// POST /api/facturacion/reservas/[id]/abonos — registra un abono adicional.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireFacturacionSession();
  if (response || !session) return response ?? NextResponse.json({ success: false, error: "Sin sesión" }, { status: 401 });

  const { id } = await params;
  let body: { monto?: number; metodoPago?: string; referencia?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, error: "Body JSON inválido" }, { status: 400 }); }

  const monto = Number(body.monto);
  // Punto 7: método de cobro (dice la cuenta); el código SRI se deduce.
  const metodoPago = body.metodoPago?.trim() ?? "";
  const referencia = body.referencia?.trim() || undefined;
  const errorCobro = mensajeCobroInvalido({ metodoPago, referencia, total: monto });
  const formaPago = codigoSriDeMetodo(metodoPago);
  if (errorCobro || !formaPago) return NextResponse.json({ success: false, error: errorCobro ?? "Elige el método de cobro" }, { status: 400 });

  const reserva = await obtenerReservaPorId(id);
  if (!reserva) return NextResponse.json({ success: false, error: "Reserva no encontrada" }, { status: 404 });
  if (reserva.estado !== "Activa") return NextResponse.json({ success: false, error: `La reserva está ${reserva.estado.toLowerCase()}; no admite más abonos` }, { status: 400 });

  const err = validarAbono(monto, reserva.precio, reserva.totalAbonado);
  if (err) return NextResponse.json({ success: false, error: err }, { status: 400 });

  const registradoPor = session.user.nombre || "Portal";
  const abono = { monto, fecha: ahoraEnEcuador().toISOString(), formaPago, metodoPago, referencia, registradoPor };

  try {
    const { totalAbonado } = await agregarAbonoReserva(id, abono, reserva.abonos, reserva.cliente, reserva.totalAbonado);

    // Abono en la tabla centralizada + su movimiento financiero. Best-effort:
    // si falla, el abono queda igual en la reserva y se avisa al operador.
    const puente = await registrarAbonoReserva({ reservaRecordId: id, numeroReserva: reserva.numero, monto, formaPago, metodoPago, referencia, registradoPor, fecha: abono.fecha });

    return NextResponse.json({
      success: true,
      data: {
        totalAbonado,
        saldoPendiente: saldoPendiente(reserva.precio, totalAbonado),
        pagoCompleto: pagoCompleto(reserva.precio, totalAbonado),
        advertencia: puente.estado === "ERROR"
          ? `El abono se guardó en la reserva, pero no llegó a Finanzas (${puente.detalle ?? "error desconocido"}). Regístralo a mano.`
          : null,
      },
    });
  } catch (e) {
    console.error("[reservas abono POST]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Error al registrar el abono" }, { status: 500 });
  }
}

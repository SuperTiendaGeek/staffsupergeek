import { NextResponse }              from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { obtenerReservaPorId }       from "@/lib/facturacion/reservas/airtable";
import { generarReservaPdf }         from "@/lib/facturacion/reservas/pdf";
import { getFacturacionConfig }      from "@/lib/facturacion/config";

export const dynamic     = "force-dynamic";
export const maxDuration = 60;

// GET /api/facturacion/reservas/[id]/pdf — comprobante del cliente. Se regenera
// al vuelo para reflejar siempre los abonos y el saldo actuales.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireFacturacionSession();
  if (response) return response;

  const { id } = await params;
  const reserva = await obtenerReservaPorId(id);
  if (!reserva) return NextResponse.json({ success: false, error: "Reserva no encontrada" }, { status: 404 });

  const cfg = getFacturacionConfig();
  try {
    const pdf = await generarReservaPdf({
      numero: reserva.numero,
      fecha: new Date(`${reserva.fecha}T12:00:00`),
      fechaLimite: reserva.fechaLimite,
      plazoDias: reserva.plazoDias,
      ruc: cfg.ruc, razonSocial: cfg.razonSocial, nombreComercial: cfg.nombreComercial, dirMatriz: cfg.dirMatriz,
      cliente: reserva.cliente, descripcionItem: reserva.descripcionItem, precio: reserva.precio,
      abonos: reserva.abonos, totalAbonado: reserva.totalAbonado,
    });
    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${reserva.numero}.pdf"` },
    });
  } catch (e) {
    console.error("[reservas pdf GET]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Error al generar el PDF" }, { status: 500 });
  }
}

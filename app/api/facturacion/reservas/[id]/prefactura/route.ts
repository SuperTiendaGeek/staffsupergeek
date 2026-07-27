import { NextResponse }              from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { construirPreFacturaReserva } from "@/lib/facturacion/reservas/facturar";

export const dynamic = "force-dynamic";

// GET /api/facturacion/reservas/[id]/prefactura?saldoFormaPago=01
// Devuelve el DatosVenta listo para emitir (o un bloqueo con el motivo). La UI
// lo revisa y luego POSTea a /api/facturacion/emitir con origen {tipo:"reserva"}.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireFacturacionSession();
  if (response) return response;

  const { id } = await params;
  const saldoFormaPago = new URL(request.url).searchParams.get("saldoFormaPago") || undefined;

  try {
    const pre = await construirPreFacturaReserva(id, saldoFormaPago);
    if (pre.bloqueado) {
      return NextResponse.json({ success: false, error: pre.motivo }, { status: 409 });
    }
    return NextResponse.json({ success: true, data: { datosVenta: pre.datosVenta, resumen: pre.resumen } });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Error al preparar la factura" }, { status: 500 });
  }
}

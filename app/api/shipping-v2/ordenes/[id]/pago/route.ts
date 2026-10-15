import { NextResponse } from "next/server";
import { canShippingV2, getShippingV2AccessContextForSession, registrarPagoOrdenCompra } from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Punto 9d: registra el pago de la orden (lo que todavía no está pagado) y su egreso en Finanzas. */
export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  try {
    const { id } = await params;
    const access = await getShippingV2AccessContextForSession(session);
    if (!canShippingV2(access, "canManagePayments")) {
      return NextResponse.json({ success: false, error: "No tienes permiso para registrar pagos de Shipping." }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const fecha = String(body.fechaPagoReal ?? "").trim();
    const pago = await registrarPagoOrdenCompra(
      id,
      {
        // Solo la fecha: se guarda al mediodía de Ecuador para que no cambie de día.
        fechaPagoReal: /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? `${fecha}T17:00:00.000Z` : fecha,
        metodoPago: String(body.metodoPago ?? "").trim(),
        cuentaOrigen: String(body.cuentaOrigen ?? ""),
        transaccionId: String(body.transaccionId ?? "").trim(),
        comprobanteUrl: String(body.comprobanteUrl ?? "").trim(),
        observacion: String(body.observacion ?? "").trim(),
      },
      { registradoPor: getShippingV2SessionName(session), access }
    );
    return NextResponse.json({ success: true, data: pago }, { status: 201 });
  } catch (error) {
    console.error("Error al registrar el pago de la orden:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { canShippingV2, getShippingV2AccessContextForSession, markShippingV2PagoAsPaid } from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  try {
    const { id } = await params;
    const access = await getShippingV2AccessContextForSession(session);
    if (!canShippingV2(access, "canManagePayments")) {
      return NextResponse.json({ success: false, error: "No tienes permiso para modificar pagos de Shipping." }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const pago = await markShippingV2PagoAsPaid(id, {
      fechaPagoReal: String(body.fechaPagoReal ?? ""),
      metodoPago: String(body.metodoPago ?? ""),
      cuentaOrigen: String(body.cuentaOrigen ?? ""),
      transaccionId: String(body.transaccionId ?? ""),
      comprobanteUrl: String(body.comprobanteUrl ?? ""),
      observacion: String(body.observacion ?? ""),
    }, { registradoPor: getShippingV2SessionName(session), access });
    return NextResponse.json({ success: true, data: pago });
  } catch (error) {
    console.error("Error al marcar pago Shipping V2 como pagado:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
}

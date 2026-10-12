import { NextResponse } from "next/server";
import { canShippingV2, completarComprobanteShippingV2Pago, getShippingV2AccessContextForSession } from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Punto 9b: completar el comprobante (nº de transacción o enlace) y la orden de un pago ya registrado. */
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
    const pago = await completarComprobanteShippingV2Pago(id, {
      transaccionId: String(body.transaccionId ?? ""),
      comprobanteUrl: String(body.comprobanteUrl ?? ""),
      orden: String(body.orden ?? ""),
    }, { registradoPor: getShippingV2SessionName(session), access });
    return NextResponse.json({ success: true, data: pago });
  } catch (error) {
    console.error("Error al completar comprobante de pago Shipping V2:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
}

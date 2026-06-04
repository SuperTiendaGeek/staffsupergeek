import { NextResponse } from "next/server";
import { cancelShippingV2Pago } from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const pago = await cancelShippingV2Pago(id, { motivo: String(body.motivo ?? "") }, { registradoPor: getShippingV2SessionName(session) });
    return NextResponse.json({ success: true, data: pago });
  } catch (error) {
    console.error("Error al anular pago Shipping V2:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
}

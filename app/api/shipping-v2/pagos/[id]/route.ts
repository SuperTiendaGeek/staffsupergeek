import { NextResponse } from "next/server";
import { getShippingV2AccessContextForSession, getShippingV2PagoById } from "@/lib/shipping-v2/airtable";
import { requireShippingV2Session } from "@/lib/shipping-v2/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  try {
    const { id } = await params;
    const access = await getShippingV2AccessContextForSession(session);
    const pago = await getShippingV2PagoById(id, access);
    return NextResponse.json({ success: true, data: pago });
  } catch (error) {
    console.error("Error al obtener pago Shipping V2:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { canShippingV2, closeShippingV2Packing, getShippingV2AccessContextForSession } from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  const { id } = await params;

  try {
    const access = await getShippingV2AccessContextForSession(session);
    if (!canShippingV2(access, "canClosePacking")) {
      return NextResponse.json({ success: false, error: "No tienes permiso para cerrar packings." }, { status: 403 });
    }
    const packing = await closeShippingV2Packing(id, {
      cerradoPor: getShippingV2SessionName(session),
      access,
    });
    return NextResponse.json({ success: true, data: packing });
  } catch (error) {
    console.error("Error al cerrar packing Shipping V2:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { getShippingV2AccessContextForSession, getShippingV2ResumenPestanas } from "@/lib/shipping-v2/airtable";
import { requireShippingV2Session } from "@/lib/shipping-v2/auth";

export const dynamic = "force-dynamic";

// Pendientes que muestra la barra de pestañas de Shipping V2 (punto 2).
export async function GET() {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  try {
    const access = await getShippingV2AccessContextForSession(session);
    const data = await getShippingV2ResumenPestanas(access);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[/api/shipping-v2/pestanas]", error);
    return NextResponse.json({ success: false, data: null }, { status: 200 });
  }
}

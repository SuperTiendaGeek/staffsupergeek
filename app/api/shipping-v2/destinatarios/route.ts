import { NextResponse } from "next/server";
import { getShippingV2AccessContextForSession, getShippingV2Destinatarios } from "@/lib/shipping-v2/airtable";
import { requireShippingV2Session } from "@/lib/shipping-v2/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;

  try {
    const access = await getShippingV2AccessContextForSession(session);
    const destinatarios = await getShippingV2Destinatarios(access);
    return NextResponse.json({ success: true, data: destinatarios });
  } catch (error) {
    console.error("Error al cargar destinatarios Shipping V2:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "No se pudieron cargar los destinatarios." }, { status: 500 });
  }
}

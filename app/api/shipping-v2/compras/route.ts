import { NextResponse } from "next/server";
import { getShippingV2AccessContextForSession } from "@/lib/shipping-v2/airtable";
import { requireShippingV2Session } from "@/lib/shipping-v2/auth";
import { perfilShippingV2 } from "@/lib/shipping-v2/access";
import { puedeComprar } from "@/lib/compras/reglas";
import { filasBandeja } from "@/lib/compras/servidor";

export const dynamic = "force-dynamic";

// Bandeja "Por comprar" (auditoría ops, Fase 2). Solo Staff y Administradores.
export async function GET() {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  const access = await getShippingV2AccessContextForSession(session);
  if (!puedeComprar(perfilShippingV2(access))) {
    return NextResponse.json({ success: false, error: "Solo Staff y Administradores ven las compras." }, { status: 403 });
  }
  try {
    return NextResponse.json({ success: true, data: await filasBandeja() });
  } catch (e) {
    console.error("[api/shipping-v2/compras]", e);
    return NextResponse.json({ success: false, error: "No se pudo leer la bandeja." }, { status: 503 });
  }
}

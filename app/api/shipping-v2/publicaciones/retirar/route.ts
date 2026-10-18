import { NextResponse } from "next/server";
import { canShippingV2, getShippingV2AccessContextForSession, retirarPublicacionShippingV2 } from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";

export const dynamic = "force-dynamic";

// Punto 10d-4: marcar como retirado un anuncio de la lista "Por retirar".
export async function POST(request: Request) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  try {
    const access = await getShippingV2AccessContextForSession(session);
    if (!access.isAdmin || !(canShippingV2(access, "canUseRecepcion") || canShippingV2(access, "canEditItems"))) {
      return NextResponse.json({ success: false, error: "No tienes permiso para gestionar anuncios." }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const publicacion = await retirarPublicacionShippingV2(String(body.id ?? ""), { actor: getShippingV2SessionName(session) });
    return NextResponse.json({ success: true, data: publicacion });
  } catch (error) {
    console.error("Error al retirar el anuncio:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
}

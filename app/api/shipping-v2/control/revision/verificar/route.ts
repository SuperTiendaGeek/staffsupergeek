import { NextResponse } from "next/server";
import { canShippingV2, getShippingV2AccessContextForSession, verificarAsuntosRevisionShippingV2 } from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Punto 10c-1: después de corregir un artículo desde Control, comprueba si sus
// asuntos quedaron resueltos (solo los suyos; no relee toda la lista a mano).
export async function POST(request: Request) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  try {
    const access = await getShippingV2AccessContextForSession(session);
    if (!access.isAdmin || !(canShippingV2(access, "canUseRecepcion") || canShippingV2(access, "canEditItems"))) {
      return NextResponse.json({ success: false, error: "No tienes permiso para el control de inventario." }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const lista = (v: unknown) => (Array.isArray(v) ? v.map(String).slice(0, 50) : []);
    const data = await verificarAsuntosRevisionShippingV2(
      { itemIds: lista(body.itemIds), asuntoIds: lista(body.asuntoIds) },
      { actor: getShippingV2SessionName(session) }
    );
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error al verificar asuntos:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
}

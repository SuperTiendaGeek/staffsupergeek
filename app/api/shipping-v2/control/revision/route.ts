import { NextResponse } from "next/server";
import { canShippingV2, getShippingV2AccessContextForSession, getShippingV2AsuntosRevision, revisarInventarioShippingV2 } from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Punto 10c-1: revisión de inventario (pestaña Control). Personal de la tienda.
async function acceso() {
  const { response, session } = await requireShippingV2Session();
  if (response) return { response };
  const access = await getShippingV2AccessContextForSession(session);
  if (!access.isAdmin || !(canShippingV2(access, "canUseRecepcion") || canShippingV2(access, "canEditItems"))) {
    return { response: NextResponse.json({ success: false, error: "No tienes permiso para el control de inventario." }, { status: 403 }) };
  }
  return { session, access };
}

export async function GET(request: Request) {
  const a = await acceso();
  if (a.response) return a.response;
  try {
    const conResueltos = new URL(request.url).searchParams.get("resueltos") === "1";
    return NextResponse.json({ success: true, data: await getShippingV2AsuntosRevision({ conResueltos }) });
  } catch (error) {
    console.error("Error al leer la revisión de inventario:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
}

/** "Revisar ahora". */
export async function POST() {
  const a = await acceso();
  if (a.response) return a.response;
  try {
    const resumen = await revisarInventarioShippingV2({ actor: getShippingV2SessionName(a.session) });
    const asuntos = await getShippingV2AsuntosRevision();
    return NextResponse.json({ success: true, data: { resumen, asuntos } });
  } catch (error) {
    console.error("Error al revisar el inventario:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { contarPublicacionesDesactualizadasShippingV2, getShippingV2AccessContextForSession, guardarShippingV2DatosTienda } from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";

export const dynamic = "force-dynamic";

// Punto 10d-2: datos fijos de la tienda (solo Administrador: cambian todos los anuncios nuevos).
export async function PATCH(request: Request) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  try {
    const access = await getShippingV2AccessContextForSession(session);
    if (access.isSiteAdmin !== true) {
      return NextResponse.json({ success: false, error: "Solo un Administrador cambia los datos de la tienda." }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const tienda = await guardarShippingV2DatosTienda(body ?? {}, { actor: getShippingV2SessionName(session) });
    const desactualizadas = await contarPublicacionesDesactualizadasShippingV2(tienda.version);
    return NextResponse.json({ success: true, data: { tienda, desactualizadas } });
  } catch (error) {
    console.error("Error al guardar los datos de la tienda:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
}

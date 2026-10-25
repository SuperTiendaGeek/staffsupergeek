import { NextResponse } from "next/server";
import { canShippingV2, getShippingV2AccessContextForSession } from "@/lib/shipping-v2/airtable";
import { requireShippingV2Session } from "@/lib/shipping-v2/auth";
import { getKardexRegistro } from "@/lib/shipping-v2/kardex-lectura";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Pestaña Kardex de la ficha (punto 12): los movimientos de esta unidad o lote.
export async function GET(_request: Request, { params }: Params) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  const { id } = await params;
  try {
    const access = await getShippingV2AccessContextForSession(session);
    if (!access.isAdmin || !canShippingV2(access, "canViewItems")) {
      return NextResponse.json({ success: false, error: "No tienes permiso para ver el Kardex." }, { status: 403 });
    }
    if (!/^rec[A-Za-z0-9]{14}$/.test(id)) return NextResponse.json({ success: false, error: "Artículo no válido." }, { status: 400 });
    return NextResponse.json({ success: true, data: await getKardexRegistro(id, { verCostos: access.isSiteAdmin === true }) });
  } catch (error) {
    console.error("Error al leer el Kardex del artículo:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
}

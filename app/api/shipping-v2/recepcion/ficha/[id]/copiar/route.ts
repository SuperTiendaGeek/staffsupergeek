import { NextResponse } from "next/server";
import { canShippingV2, copiarFichaTecnicaAUnidades, getShippingV2AccessContextForSession } from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Punto 10b-4b: "¿Usar estos datos técnicos en otras unidades?" de la ficha de mostrador. */
export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  const { id } = await params;

  try {
    const access = await getShippingV2AccessContextForSession(session);
    if (!canShippingV2(access, "canUseRecepcion")) {
      return NextResponse.json({ success: false, error: "No tienes permiso para editar fichas técnicas." }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as { destinos?: unknown };
    const destinos = Array.isArray(body.destinos) ? body.destinos.filter((d): d is string => typeof d === "string") : [];
    const resultado = await copiarFichaTecnicaAUnidades(id, destinos, { actor: getShippingV2SessionName(session), access });
    return NextResponse.json({ success: true, data: resultado });
  } catch (error) {
    console.error("Error al copiar la ficha técnica a otras unidades:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { canShippingV2, createShippingV2ItemNovedad, getShippingV2AccessContextForSession } from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";
import { origenPublico } from "@/lib/tecnicos/presupuesto/origen";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  const { id } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const access = await getShippingV2AccessContextForSession(session);
    if (!canShippingV2(access, "canCreateNovedades")) {
      return NextResponse.json({ success: false, error: "No tienes permiso para registrar novedades." }, { status: 403 });
    }
    const result = await createShippingV2ItemNovedad(
      id,
      {
        tipo: String(body.tipo ?? ""),
        descripcion: String(body.descripcion ?? ""),
        packingId: String(body.packingId ?? ""),
        bloquearVenta: body.bloquearVenta === true,
        responsable: typeof body.responsable === "string" ? body.responsable : undefined,
      },
      // Con access: solo el personal de la tienda registra (punto 8).
      { registradoPor: getShippingV2SessionName(session), access, origin: origenPublico(request) }
    );
    return NextResponse.json({ success: true, data: result.item, novedad: result.novedad, aviso: result.aviso || undefined, correo: result.correo || undefined });
  } catch (error) {
    console.error("Error al registrar novedad de item Shipping V2:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
}

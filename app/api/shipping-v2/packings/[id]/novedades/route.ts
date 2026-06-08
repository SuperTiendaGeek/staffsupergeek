import { NextResponse } from "next/server";
import { createShippingV2PackingNovedad, getShippingV2AccessContextForSession } from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  const { id } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const access = await getShippingV2AccessContextForSession(session);
    const result = await createShippingV2PackingNovedad(
      id,
      {
        tipo: String(body.tipo ?? ""),
        descripcion: String(body.descripcion ?? ""),
        evidenciaUrl: String(body.evidenciaUrl ?? ""),
      },
      {
        registradoPor: getShippingV2SessionName(session),
        access,
      }
    );
    return NextResponse.json({ success: true, data: result.packing, novedad: result.novedad });
  } catch (error) {
    console.error("Error al registrar novedad de packing Shipping V2:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
}

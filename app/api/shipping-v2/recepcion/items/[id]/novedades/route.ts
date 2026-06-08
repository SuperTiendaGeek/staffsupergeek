import { NextResponse } from "next/server";
import { createShippingV2ItemNovedad } from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  const { id } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const result = await createShippingV2ItemNovedad(
      id,
      {
        tipo: String(body.tipo ?? ""),
        descripcion: String(body.descripcion ?? ""),
        evidenciaUrl: String(body.evidenciaUrl ?? ""),
        packingId: String(body.packingId ?? ""),
      },
      { registradoPor: getShippingV2SessionName(session) }
    );
    return NextResponse.json({ success: true, data: result.item, novedad: result.novedad });
  } catch (error) {
    console.error("Error al registrar novedad de item Shipping V2:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
}

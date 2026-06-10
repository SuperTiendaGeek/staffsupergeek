import { NextResponse } from "next/server";
import { getShippingV2AccessContextForSession, linkShippingV2DestinatarioToPacking } from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  const { id } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const destinatarioId = String(body.destinatarioId ?? "").trim();
    if (!destinatarioId) throw new Error("Selecciona un destinatario válido.");
    const access = await getShippingV2AccessContextForSession(session);
    const result = await linkShippingV2DestinatarioToPacking(id, destinatarioId, {
      access,
      registradoPor: getShippingV2SessionName(session),
    });
    return NextResponse.json({ success: true, data: result.destinatario, packing: result.packing });
  } catch (error) {
    console.error("Error al vincular destinatario Shipping V2:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "No se pudo vincular el destinatario." }, { status: 400 });
  }
}

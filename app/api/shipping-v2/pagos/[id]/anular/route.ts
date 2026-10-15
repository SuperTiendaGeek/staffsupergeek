import { NextResponse } from "next/server";
import { anularPagoShippingV2, getShippingV2AccessContextForSession } from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Punto 9d: solo Administrador, con motivo. Anula un pago de compra y su egreso en Finanzas. */
export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  try {
    const { id } = await params;
    const access = await getShippingV2AccessContextForSession(session);
    if (access.isSiteAdmin !== true) {
      return NextResponse.json({ success: false, error: "Solo el Administrador puede anular un pago." }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const resultado = await anularPagoShippingV2(id, { motivo: String(body.motivo ?? "") }, { registradoPor: getShippingV2SessionName(session), access });
    return NextResponse.json({ success: true, data: resultado });
  } catch (error) {
    console.error("Error al anular el pago:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
}

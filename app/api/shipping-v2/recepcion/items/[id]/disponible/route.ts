import { NextResponse } from "next/server";
import { marcarShippingV2ItemDisponible } from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Publica un item como listo para vender (Estado Item → "Disponible").
// Las condiciones viven en lib/shipping-v2/item-availability.ts.
export async function POST(_request: Request, { params }: Params) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;

  const { id } = await params;

  try {
    const item = await marcarShippingV2ItemDisponible(id, {
      actualizadoPor: getShippingV2SessionName(session),
    });
    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    console.error("Error al publicar item Shipping V2 como disponible:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 400 }
    );
  }
}

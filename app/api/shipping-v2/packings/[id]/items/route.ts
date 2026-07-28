import { NextResponse } from "next/server";
import { addItemsToShippingV2Packing, canShippingV2, getShippingV2AccessContextForSession, removeItemFromShippingV2Packing } from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Error inesperado";
  if (message.includes("ROW_TABLE_DOES_NOT_MATCH_LINKED_TABLE")) {
    return "El vínculo ya fue creado, pero hubo un error actualizando campos relacionados. Refresca la pantalla.";
  }
  return message;
}

export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  const { id } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const itemIds = Array.isArray(body.itemIds) ? body.itemIds.map(String) : [];
    const access = await getShippingV2AccessContextForSession(session);
    if (!canShippingV2(access, "canAddItemsToPacking")) {
      return NextResponse.json({ success: false, error: "No tienes permiso para agregar items al packing." }, { status: 403 });
    }
    const result = await addItemsToShippingV2Packing(id, itemIds, {
      registradoPor: getShippingV2SessionName(session),
      access,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Error al agregar items a packing Shipping V2:", error);
    return NextResponse.json({ success: false, error: errorMessage(error) }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  const { id } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const access = await getShippingV2AccessContextForSession(session);
    if (!canShippingV2(access, "canRemoveItemsFromPacking")) {
      return NextResponse.json({ success: false, error: "No tienes permiso para quitar items del packing." }, { status: 403 });
    }
    const result = await removeItemFromShippingV2Packing(id, String(body.itemId ?? ""), {
      registradoPor: getShippingV2SessionName(session),
      access,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Error al quitar item de packing Shipping V2:", error);
    return NextResponse.json({ success: false, error: errorMessage(error) }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { canShippingV2, getShippingV2AccessContextForSession, updateShippingV2ReceptionChecklistItem } from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";
import type { ShippingV2RecepcionChecklistAction } from "@/types/shipping-v2";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const ALLOWED_ACTIONS = new Set<ShippingV2RecepcionChecklistAction>([
  "received",
  "reviewed",
  "photos-taken",
  "published-shopify",
  "published-marketplace",
  "published-mercado-libre",
  "published-facebook",
]);

function parseAction(value: unknown): ShippingV2RecepcionChecklistAction {
  const action = String(value ?? "").trim() as ShippingV2RecepcionChecklistAction;
  if (!ALLOWED_ACTIONS.has(action)) throw new Error("Acción de recepción no soportada.");
  return action;
}

function parseBoolean(value: unknown) {
  return value === true || value === "true" || value === "on";
}

export async function PATCH(request: Request, { params }: Params) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  const { id } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const access = await getShippingV2AccessContextForSession(session);
    if (!canShippingV2(access, "canUseRecepcion")) {
      return NextResponse.json({ success: false, error: "No tienes permiso para usar recepción." }, { status: 403 });
    }
    const item = await updateShippingV2ReceptionChecklistItem(
      id,
      {
        action: parseAction(body.action ?? body.field),
        value: parseBoolean(body.value),
        note: String(body.note ?? ""),
      },
      { actualizadoPor: getShippingV2SessionName(session) }
    );
    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    console.error("Error al actualizar checklist de recepción Shipping V2:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
}

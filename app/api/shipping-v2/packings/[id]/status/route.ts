import { NextResponse } from "next/server";
import { canShippingV2, getShippingV2AccessContextForSession, transitionShippingV2PackingStatus } from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";
import type { ShippingV2PackingStatusAction } from "@/types/shipping-v2";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const SUPPORTED_ACTIONS = new Set<ShippingV2PackingStatusAction>([
  "close",
  "mark-in-transit",
  "mark-received",
  "start-review",
  "continue-review",
  "restore-in-transit",
  "restore-received",
  "restore-review",
  "close-final",
  "cancel",
]);

function parseAction(value: unknown): ShippingV2PackingStatusAction {
  const action = String(value ?? "").trim() as ShippingV2PackingStatusAction;
  if (!SUPPORTED_ACTIONS.has(action)) throw new Error("Acción de estado no soportada.");
  return action;
}

export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  const { id } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const access = await getShippingV2AccessContextForSession(session);
    const action = parseAction(body.action);
    const allowed = action === "close"
      ? canShippingV2(access, "canClosePacking")
      : canShippingV2(access, "canTransitionPackingStatus");
    if (!allowed) {
      return NextResponse.json({ success: false, error: "No tienes permiso para cambiar este estado del packing." }, { status: 403 });
    }
    const packing = await transitionShippingV2PackingStatus(id, {
      action,
      actor: getShippingV2SessionName(session),
      decision: String(body.decision ?? ""),
      access,
    });
    return NextResponse.json({ success: true, data: packing });
  } catch (error) {
    console.error("Error al cambiar estado de packing Shipping V2:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
}

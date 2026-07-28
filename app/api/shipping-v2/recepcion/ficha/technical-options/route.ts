import { NextResponse } from "next/server";
import { canShippingV2, createShippingV2TechnicalOption, getShippingV2AccessContextForSession, type ShippingV2TechnicalOptionType } from "@/lib/shipping-v2/airtable";
import { requireShippingV2Session } from "@/lib/shipping-v2/auth";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = new Set<ShippingV2TechnicalOptionType>(["connectivity", "port", "extraFeature"]);

function parseType(value: unknown): ShippingV2TechnicalOptionType {
  const type = String(value ?? "").trim() as ShippingV2TechnicalOptionType;
  if (!ALLOWED_TYPES.has(type)) throw new Error("Tipo de opción técnica inválido.");
  return type;
}

export async function POST(request: Request) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;

  try {
    const access = await getShippingV2AccessContextForSession(session);
    if (!canShippingV2(access, "canUseRecepcion")) {
      return NextResponse.json({ ok: false, error: "No tienes permiso para crear opciones técnicas." }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const result = await createShippingV2TechnicalOption({
      type: parseType(body.type),
      label: String(body.label ?? ""),
      session,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error al crear opción técnica Shipping V2:", error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
}

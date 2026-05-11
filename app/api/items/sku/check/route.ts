import { NextResponse } from "next/server";
import { checkSkuAvailability, normalizeSku } from "@/lib/sku/sku-service";
import { getSessionFromCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ success: false, error: "No autenticado." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const sku = normalizeSku(searchParams.get("sku") || "");
  const excludeRecordId = searchParams.get("excludeRecordId") || undefined;

  if (!sku) {
    return NextResponse.json({ success: false, error: "SKU requerido." }, { status: 400 });
  }

  const availability = await checkSkuAvailability(sku, excludeRecordId);
  return NextResponse.json({
    ...availability,
    message: availability.available ? "SKU disponible." : "Este SKU ya está usado en otro item.",
  });
}

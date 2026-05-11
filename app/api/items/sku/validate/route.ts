import { NextResponse } from "next/server";
import { validateSkuForItem } from "@/lib/sku/sku-service";
import { getSessionFromCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ success: false, error: "No autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const sku = typeof body?.sku === "string" ? body.sku : "";
  const excludeRecordId = typeof body?.excludeRecordId === "string" ? body.excludeRecordId : undefined;

  const result = await validateSkuForItem({ sku, excludeRecordId });
  return NextResponse.json(result, { status: result.valid ? 200 : 400 });
}

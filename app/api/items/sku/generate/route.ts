import { NextResponse } from "next/server";
import { generateUniqueSku } from "@/lib/sku/sku-service";
import { getSessionFromCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ success: false, error: "No autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const category = typeof body?.category === "string" ? body.category : undefined;
  const sku = await generateUniqueSku(category);

  return NextResponse.json({ sku });
}

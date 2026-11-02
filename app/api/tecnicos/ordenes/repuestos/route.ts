import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { resumenRepuestosDeOrdenes } from "@/lib/compras/servidor";

export const dynamic = "force-dynamic";

// Fase 2: chip del listado de órdenes ("Repuestos 2/3", "1 sin comprar").
// GET ?ids=rec1,rec2 (las órdenes de la página visible).
export async function GET(request: Request) {
  const { session, response } = await requireTecnicosSession();
  if (response || !session) return response ?? NextResponse.json({ success: false }, { status: 401 });
  const ids = (new URL(request.url).searchParams.get("ids") ?? "")
    .split(",").map((x) => x.trim()).filter((x) => /^rec[A-Za-z0-9]{14}$/.test(x)).slice(0, 100);
  if (!ids.length) return NextResponse.json({ success: true, data: {} });
  try {
    return NextResponse.json({ success: true, data: await resumenRepuestosDeOrdenes(ids) });
  } catch (e) {
    console.error("[api/tecnicos/ordenes/repuestos]", e);
    return NextResponse.json({ success: false, data: {} });
  }
}

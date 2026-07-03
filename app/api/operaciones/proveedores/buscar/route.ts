import { type NextRequest, NextResponse } from "next/server";
import { requireOperacionesSession } from "@/lib/operaciones/auth";
import { buscarProveedoresOp } from "@/lib/operaciones/airtable";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { response } = await requireOperacionesSession();
  if (response) return response;

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ success: true, data: [] });

  try {
    const data = await buscarProveedoresOp(q);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[api/operaciones/proveedores/buscar] GET error:", err);
    return NextResponse.json({ success: false, error: "Error al buscar proveedores." }, { status: 500 });
  }
}

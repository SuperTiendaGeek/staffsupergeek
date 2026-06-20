import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { fetchProveedoresSoftware } from "@/lib/admin/proveedores-software";

export const dynamic = "force-dynamic";

export async function GET() {
  const { response } = await requireTecnicosSession();
  if (response) return response;

  try {
    const data = await fetchProveedoresSoftware();
    return NextResponse.json({ success: true, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al obtener proveedores";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

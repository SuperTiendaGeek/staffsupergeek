import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { panelDeGarantias } from "@/lib/garantias/panel-servidor";

export const dynamic = "force-dynamic";

// GET: todas las garantías (pantalla Técnicos → Garantías, punto 20).
export async function GET() {
  const { response } = await requireTecnicosSession();
  if (response) return response;
  try {
    return NextResponse.json({ success: true, data: await panelDeGarantias() });
  } catch (e) {
    console.error("[garantias panel]", e);
    return NextResponse.json({ success: false, error: "No se pudieron leer las garantías." }, { status: 500 });
  }
}

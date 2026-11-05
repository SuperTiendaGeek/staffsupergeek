import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { ErrorGarantia, origenesDeGarantia } from "@/lib/garantias/servidor";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// GET: lo que el cliente de esta orden puede reclamar en garantía ("¿Qué
// falló?"), con su plazo y si sigue vigente (auditoría ops, punto 20).
export async function GET(_: Request, { params }: Params) {
  const { response } = await requireTecnicosSession();
  if (response) return response;
  const { id } = await params;
  try {
    return NextResponse.json({ success: true, data: await origenesDeGarantia(id) });
  } catch (e) {
    if (e instanceof ErrorGarantia) return NextResponse.json({ success: false, error: e.message }, { status: 404 });
    console.error("[garantia origenes]", e);
    return NextResponse.json({ success: false, error: "No se pudo leer lo que compró el cliente." }, { status: 500 });
  }
}

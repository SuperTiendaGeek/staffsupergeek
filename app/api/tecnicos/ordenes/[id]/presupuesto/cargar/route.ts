import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { vistaPrevia, aprobarYCargar } from "@/lib/tecnicos/presupuesto/cargar";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

// POST /api/tecnicos/ordenes/[id]/presupuesto/cargar
// Body: { lineaIds: string[], confirmar?: boolean }
//   confirmar=false (o ausente) → VISTA PREVIA: qué pasará con cada línea.
//                                 No escribe nada.
//   confirmar=true              → el cliente aprobó: se cargan a la orden.
export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireTecnicosSession();
  if (response || !session) return response ?? NextResponse.json({ success: false, error: "Sin sesión" }, { status: 401 });
  const { id } = await params;

  const body = (await request.json().catch(() => ({}))) as { lineaIds?: unknown; confirmar?: boolean };
  const lineaIds = Array.isArray(body.lineaIds) ? body.lineaIds.filter((x): x is string => typeof x === "string") : [];
  if (lineaIds.length === 0) return NextResponse.json({ success: false, error: "Elige al menos una línea." }, { status: 400 });

  try {
    if (!body.confirmar) {
      return NextResponse.json({ success: true, data: { vistaPrevia: await vistaPrevia(id, lineaIds) } });
    }
    const resultados = await aprobarYCargar({
      ordenId: id,
      lineaIds,
      usuario: { nombre: session.user.nombre || session.user.email || "Portal", id: session.user.userId ?? null },
    });
    return NextResponse.json({ success: true, data: { resultados } });
  } catch (e) {
    console.error("[presupuesto cargar]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "No se pudo cargar el presupuesto" }, { status: 500 });
  }
}

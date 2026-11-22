import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { ErrorRegreso, prepararRegreso, registrarRegreso } from "@/lib/tecnicos/regreso/servidor";

// «Regresó el equipo» (rediseño R6): la orden entregada queda cerrada y el
// regreso crea una orden nueva enlazada a ella.
//   GET  → datos para el diálogo (equipo, cliente y «¿Qué falló?»)
//   POST → { tipo, motivo, queFalloClave? } crea la orden nueva

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const error = (e: unknown, texto: string) => {
  if (e instanceof ErrorRegreso) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
  console.error(`[regreso] ${texto}`, e);
  return NextResponse.json({ success: false, error: texto }, { status: 500 });
};

export async function GET(_request: Request, { params }: Params) {
  const { response } = await requireTecnicosSession();
  if (response) return response;
  const { id } = await params;
  try {
    return NextResponse.json({ success: true, data: await prepararRegreso(id) });
  } catch (e) {
    return error(e, "No se pudo preparar el regreso.");
  }
}

export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireTecnicosSession();
  if (response) return response;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { tipo?: unknown; motivo?: unknown; queFalloClave?: unknown };
  try {
    const data = await registrarRegreso({
      ordenId: id,
      tipo: body.tipo,
      motivo: body.motivo,
      queFalloClave: typeof body.queFalloClave === "string" ? body.queFalloClave : null,
      usuario: { nombre: session.user.nombre ?? null, email: session.user.email ?? null, id: session.user.userId ?? null },
    });
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (e) {
    return error(e, "No se pudo crear la orden del regreso.");
  }
}

import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { ErrorEntrega, entregarOrden, revisarEntrega } from "@/lib/entrega/servidor";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Entregar al cliente (auditoría ops, punto 6).
// GET: la revisión (pendientes, cobro, documento) para el panel. No escribe.
export async function GET(_: Request, { params }: Params) {
  const { response } = await requireTecnicosSession();
  if (response) return response;
  const { id } = await params;
  try {
    return NextResponse.json({ success: true, data: await revisarEntrega(id) });
  } catch (e) {
    console.error("[entregar] revisar", e);
    const msg = e instanceof ErrorEntrega ? e.message : "No se pudo revisar la orden. Intenta de nuevo.";
    return NextResponse.json({ success: false, error: msg }, { status: e instanceof ErrorEntrega ? 404 : 503 });
  }
}

// POST: entrega. El servidor vuelve a revisar todo; nadie se salta la revisión.
export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireTecnicosSession();
  if (response) return response;
  const { id } = await params;
  let body: Record<string, unknown> = {};
  try { body = await request.json(); } catch { /* body vacío */ }
  const s = (k: string) => (typeof body[k] === "string" ? (body[k] as string).slice(0, 500) : "");
  try {
    const r = await entregarOrden({
      ordenId: id,
      datos: {
        retiradoPor: s("retiradoPor"), accesoriosDevueltos: s("accesoriosDevueltos"), estadoAlEntregar: s("estadoAlEntregar"),
        motivoSinCobro: s("motivoSinCobro") || null, detalleSinCobro: s("detalleSinCobro"),
      },
      usuario: { nombre: session.user.nombre || session.user.email || "Portal", email: session.user.email ?? null, userId: session.user.userId ?? null },
    });
    return NextResponse.json({ success: true, data: r });
  } catch (e) {
    if (e instanceof ErrorEntrega) return NextResponse.json({ success: false, error: e.message, faltas: e.faltas }, { status: 409 });
    console.error("[entregar]", e);
    return NextResponse.json({ success: false, error: "No se pudo entregar. Intenta de nuevo." }, { status: 500 });
  }
}

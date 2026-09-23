import { NextResponse } from "next/server";
import { responderPresupuesto, vistaPublica } from "@/lib/tecnicos/presupuesto/enlace";
import type { EnvioRespuesta } from "@/lib/tecnicos/presupuesto/enlace-reglas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Ruta PÚBLICA (sin login): la protege el token aleatorio del enlace.
// No está en proxy.ts a propósito. Solo expone lo necesario para responder.

type Params = { params: Promise<{ token: string }> };

const NO_CACHE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

export async function GET(_request: Request, { params }: Params) {
  const { token } = await params;
  try {
    const vista = await vistaPublica(token);
    if (!vista) return NextResponse.json({ success: false, error: "Este enlace no existe." }, { status: 404, headers: NO_CACHE });
    return NextResponse.json({ success: true, data: vista }, { headers: NO_CACHE });
  } catch (e) {
    console.error("[presupuesto público GET]", e);
    return NextResponse.json({ success: false, error: "No pudimos cargar el presupuesto. Intenta de nuevo." }, { status: 500, headers: NO_CACHE });
  }
}

export async function POST(request: Request, { params }: Params) {
  const { token } = await params;
  const body = (await request.json().catch(() => null)) as Partial<EnvioRespuesta> | null;
  if (!body || !Array.isArray(body.decisiones)) {
    return NextResponse.json({ success: false, error: "Respuesta inválida." }, { status: 400, headers: NO_CACHE });
  }
  const envio: EnvioRespuesta = {
    decisiones: body.decisiones.slice(0, 200).map((d) => ({ lineaId: String(d?.lineaId ?? ""), decision: d?.decision === "aprobar" ? "aprobar" : d?.decision === "no" ? "no" : ("x" as never), huella: String(d?.huella ?? "") })),
    nombre: String(body.nombre ?? "").slice(0, 200),
    cedula4: String(body.cedula4 ?? "").slice(0, 10),
    acepta: body.acepta === true,
    entiendeNecesarias: body.entiendeNecesarias === true,
  };
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || request.headers.get("x-real-ip") || "";
  try {
    const r = await responderPresupuesto(token, envio, { ip, dispositivo: request.headers.get("user-agent") ?? "" });
    if (!r.ok) return NextResponse.json({ success: false, error: r.error, codigo: r.codigo }, { status: r.status, headers: NO_CACHE });
    return NextResponse.json({ success: true, data: r }, { headers: NO_CACHE });
  } catch (e) {
    console.error("[presupuesto público POST]", e);
    return NextResponse.json({ success: false, error: "No pudimos guardar tu respuesta. Intenta de nuevo." }, { status: 500, headers: NO_CACHE });
  }
}

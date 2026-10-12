import { NextResponse } from "next/server";
import { leerNovedadPorEnlace, responderNovedadPorEnlace } from "@/lib/shipping-v2/airtable";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Ruta PÚBLICA (sin login) del botón RESPONDER del correo al proveedor
// (auditoría Shipping V2, punto 8c). La protege el código aleatorio del
// enlace: dura 7 días y sirve una sola vez. No está en proxy.ts a propósito.
// Solo muestra esa novedad, sin datos internos de la tienda.

type Params = { params: Promise<{ token: string }> };

const NO_CACHE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

export async function GET(_request: Request, { params }: Params) {
  const { token } = await params;
  try {
    const vista = await leerNovedadPorEnlace(token);
    return NextResponse.json({ success: true, data: vista }, { headers: NO_CACHE });
  } catch (error) {
    console.error("[novedad pública GET]", error);
    return NextResponse.json({ success: false, error: "No pudimos cargar la novedad. Intente de nuevo." }, { status: 500, headers: NO_CACHE });
  }
}

export async function POST(request: Request, { params }: Params) {
  const { token } = await params;
  const body = (await request.json().catch(() => null)) as { texto?: unknown; propuesta?: unknown } | null;
  if (!body) return NextResponse.json({ success: false, error: "Respuesta inválida." }, { status: 400, headers: NO_CACHE });
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || request.headers.get("x-real-ip") || "";
  try {
    const r = await responderNovedadPorEnlace(
      token,
      { texto: String(body.texto ?? "").slice(0, 4000), propuesta: typeof body.propuesta === "string" ? body.propuesta.slice(0, 60) : undefined },
      { ip }
    );
    if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: r.status, headers: NO_CACHE });
    return NextResponse.json({ success: true }, { headers: NO_CACHE });
  } catch (error) {
    console.error("[novedad pública POST]", error);
    return NextResponse.json({ success: false, error: "No pudimos guardar su respuesta. Intente de nuevo." }, { status: 500, headers: NO_CACHE });
  }
}

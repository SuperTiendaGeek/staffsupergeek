import { NextResponse } from "next/server";
import { elegirOpcionPedido, vistaPublicaPedido } from "@/lib/pedidos-especiales/enlace";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Ruta PÚBLICA (sin login) del pedido especial (punto 10A-3): la protege el
// token aleatorio del enlace. No está en proxy.ts a propósito.
//   GET  → lo que el cliente ve (sin proveedor, costo, URL ni datos personales).
//   POST { opcionId, huellas } → guarda su elección ("Acepto la opción N").

type Params = { params: Promise<{ token: string }> };

const NO_CACHE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

export async function GET(_request: Request, { params }: Params) {
  const { token } = await params;
  try {
    const vista = await vistaPublicaPedido(token);
    if (!vista) return NextResponse.json({ success: false, error: "Este enlace no existe." }, { status: 404, headers: NO_CACHE });
    return NextResponse.json({ success: true, data: vista }, { headers: NO_CACHE });
  } catch (e) {
    console.error("[pedido público GET]", e);
    return NextResponse.json({ success: false, error: "No pudimos cargar tu pedido. Intenta de nuevo." }, { status: 500, headers: NO_CACHE });
  }
}

export async function POST(request: Request, { params }: Params) {
  const { token } = await params;
  const body = (await request.json().catch(() => null)) as { opcionId?: unknown; huellas?: unknown } | null;
  if (!body || typeof body.huellas !== "object" || body.huellas === null) {
    return NextResponse.json({ success: false, error: "Respuesta inválida." }, { status: 400, headers: NO_CACHE });
  }
  const huellas = Object.fromEntries(
    Object.entries(body.huellas as Record<string, unknown>).slice(0, 100).map(([k, v]) => [String(k).slice(0, 40), String(v ?? "").slice(0, 40)]),
  );
  const opcionId = typeof body.opcionId === "string" && body.opcionId ? body.opcionId.slice(0, 40) : null;
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || request.headers.get("x-real-ip") || "";
  try {
    const r = await elegirOpcionPedido(token, { opcionId, huellas }, { ip, dispositivo: request.headers.get("user-agent") ?? "" });
    if (!r.ok) return NextResponse.json({ success: false, error: r.error, codigo: r.codigo }, { status: r.status, headers: NO_CACHE });
    return NextResponse.json({ success: true, data: r.vista, confirmado: r.confirmado }, { headers: NO_CACHE });
  } catch (e) {
    console.error("[pedido público POST]", e);
    return NextResponse.json({ success: false, error: "No pudimos guardar tu elección. Intenta de nuevo." }, { status: 500, headers: NO_CACHE });
  }
}

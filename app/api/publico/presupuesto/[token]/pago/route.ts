import { NextResponse } from "next/server";
import { abrirPagoOrden } from "@/lib/pagos-en-linea/servidor";
import { PARA_PAGO, type ParaPago } from "@/lib/pagos-en-linea/reglas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Ruta PÚBLICA (maquetas 7a/7b, 17-nov): el cliente abre la cajita de pago
// con tarjeta desde el enlace del presupuesto de su orden. Lo protege el token
// del enlace. El cliente solo dice QUÉ paga ("Confirmar" = sus repuestos ·
// "Todo" · "Lo que falta"); el MONTO lo calcula el servidor con la cuenta del
// momento. Igual que /api/publico/pedido/[token]/pago (mismo motor).

type Params = { params: Promise<{ token: string }> };
const NO_CACHE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

export async function POST(request: Request, { params }: Params) {
  const { token } = await params;
  const body = (await request.json().catch(() => null)) as { para?: unknown } | null;
  const para = typeof body?.para === "string" && (PARA_PAGO as readonly string[]).includes(body.para) ? (body.para as ParaPago) : null;
  if (!para) return NextResponse.json({ success: false, error: "Solicitud inválida." }, { status: 400, headers: NO_CACHE });
  try {
    const r = await abrirPagoOrden(token, para);
    if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: r.status, headers: NO_CACHE });
    return NextResponse.json({ success: true, data: { codigo: r.codigo, monto: r.monto, cajita: r.cajita } }, { headers: NO_CACHE });
  } catch (e) {
    console.error("[presupuesto público pago]", e);
    return NextResponse.json({ success: false, error: "No pudimos abrir el pago con tarjeta. Intenta de nuevo." }, { status: 500, headers: NO_CACHE });
  }
}

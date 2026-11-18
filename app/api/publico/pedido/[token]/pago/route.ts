import { NextResponse } from "next/server";
import { abrirPagoPedido } from "@/lib/pagos-en-linea/servidor";
import { PARA_PAGO, type ParaPago, type Pasarela } from "@/lib/pagos-en-linea/reglas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Ruta PÚBLICA (punto 23 / 10D): el cliente abre la cajita de pago con
// tarjeta desde su enlace. Lo protege el token del pedido. El cliente solo
// dice QUÉ paga ("Confirmar" · "Todo" · "Lo que falta"); el MONTO lo calcula
// el servidor con la cuenta del momento.

type Params = { params: Promise<{ token: string }> };
const NO_CACHE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

export async function POST(request: Request, { params }: Params) {
  const { token } = await params;
  const body = (await request.json().catch(() => null)) as { para?: unknown; pasarela?: unknown; parte?: unknown } | null;
  const para = typeof body?.para === "string" && (PARA_PAGO as readonly string[]).includes(body.para) ? (body.para as ParaPago) : null;
  const pasarela: Pasarela | null = body?.pasarela === undefined || body?.pasarela === "PayPhone" ? "PayPhone" : body?.pasarela === "DeUna" ? "DeUna" : null;
  // "Dividir el pago" (7a): la parte con tarjeta; el servidor la valida contra el monto de la opción.
  const parte = body?.parte === undefined ? undefined : typeof body.parte === "number" && Number.isFinite(body.parte) ? body.parte : NaN;
  if (!para || !pasarela || Number.isNaN(parte)) return NextResponse.json({ success: false, error: "Solicitud inválida." }, { status: 400, headers: NO_CACHE });
  try {
    const r = await abrirPagoPedido(token, para, pasarela, parte);
    if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: r.status, headers: NO_CACHE });
    return NextResponse.json({ success: true, data: { codigo: r.codigo, monto: r.monto, cajita: r.cajita, deuna: r.deuna } }, { headers: NO_CACHE });
  } catch (e) {
    console.error("[pedido público pago]", e);
    return NextResponse.json({ success: false, error: pasarela === "DeUna" ? "No pudimos abrir el pago con DeUna. Intenta de nuevo." : "No pudimos abrir el pago con tarjeta. Intenta de nuevo." }, { status: 500, headers: NO_CACHE });
  }
}

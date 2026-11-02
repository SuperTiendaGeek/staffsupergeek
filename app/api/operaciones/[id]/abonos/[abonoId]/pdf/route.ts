import { NextResponse } from "next/server";
import { requireOperacionesSession } from "@/lib/operaciones/auth";
import { responderPdfComprobanteAbono } from "@/lib/cobros/comprobante-abono-ruta";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string; abonoId: string }> };

// GET: PDF del comprobante de abono de un pedido (se regenera con la cuenta actual).
export async function GET(_: Request, { params }: Params) {
  const { session, response } = await requireOperacionesSession();
  if (response || !session) return response ?? NextResponse.json({ success: false }, { status: 401 });
  const { id, abonoId } = await params;
  return responderPdfComprobanteAbono({ operacionId: id }, abonoId);
}

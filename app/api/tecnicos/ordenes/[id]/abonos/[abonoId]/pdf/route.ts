import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { responderPdfComprobanteAbono } from "@/lib/cobros/comprobante-abono-ruta";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string; abonoId: string }> };

// GET: PDF del comprobante de abono de una orden (se regenera con la cuenta actual).
export async function GET(_: Request, { params }: Params) {
  const { session, response } = await requireTecnicosSession();
  if (response || !session) return response ?? NextResponse.json({ success: false }, { status: 401 });
  const { id, abonoId } = await params;
  return responderPdfComprobanteAbono({ ordenId: id }, abonoId);
}

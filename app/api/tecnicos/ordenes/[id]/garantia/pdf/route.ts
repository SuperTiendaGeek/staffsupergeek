import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { cargarComprobanteGarantia } from "@/lib/garantias/comprobante-servidor";
import { generarComprobanteGarantiaPdf } from "@/lib/garantias/comprobante-pdf";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

// GET: PDF A4 de la entrega en garantía de una orden (se regenera con los datos actuales).
export async function GET(_: Request, { params }: Params) {
  const { session, response } = await requireTecnicosSession();
  if (response || !session) return response ?? NextResponse.json({ success: false }, { status: 401 });
  const { id } = await params;
  try {
    const r = await cargarComprobanteGarantia(id);
    if (!r.ok) return NextResponse.json({ success: false, error: r.motivo }, { status: r.status });
    const pdf = await generarComprobanteGarantiaPdf(r.emisor, r.comprobante);
    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${r.comprobante.numero}.pdf"` },
    });
  } catch (e) {
    console.error("[comprobante-garantia pdf]", e);
    return NextResponse.json({ success: false, error: "No se pudo generar el PDF." }, { status: 500 });
  }
}

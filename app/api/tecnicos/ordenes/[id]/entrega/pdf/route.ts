import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { cargarComprobanteEntrega } from "@/lib/entrega/comprobante-servidor";
import { generarComprobanteEntregaPdf } from "@/lib/entrega/comprobante-pdf";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

// GET: PDF A4 del Comprobante de entrega (sin cobro) de una orden.
export async function GET(_: Request, { params }: Params) {
  const { session, response } = await requireTecnicosSession();
  if (response || !session) return response ?? NextResponse.json({ success: false }, { status: 401 });
  const { id } = await params;
  try {
    const r = await cargarComprobanteEntrega(id);
    if (!r.ok) return NextResponse.json({ success: false, error: r.motivo }, { status: r.status });
    const pdf = await generarComprobanteEntregaPdf(r.emisor, r.comprobante);
    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${r.comprobante.numero}.pdf"` },
    });
  } catch (e) {
    console.error("[comprobante-entrega pdf]", e);
    return NextResponse.json({ success: false, error: "No se pudo generar el PDF." }, { status: 500 });
  }
}

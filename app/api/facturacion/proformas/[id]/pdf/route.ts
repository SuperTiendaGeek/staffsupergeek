import { NextResponse }              from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { obtenerProformaPorId }      from "@/lib/facturacion/proformas/airtable";

export const dynamic = "force-dynamic";

// GET /api/facturacion/proformas/[id]/pdf — sirve el PDF adjunto de la proforma.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireFacturacionSession();
  if (response) return response;

  const { id } = await params;
  const proforma = await obtenerProformaPorId(id);
  if (!proforma || !proforma.pdfUrl) {
    return NextResponse.json({ success: false, error: "PDF no encontrado" }, { status: 404 });
  }

  const res = await fetch(proforma.pdfUrl);
  if (!res.ok) return NextResponse.json({ success: false, error: "No se pudo obtener el PDF" }, { status: 502 });
  const buffer = Buffer.from(await res.arrayBuffer());
  return new NextResponse(buffer, {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${proforma.numero}.pdf"` },
  });
}

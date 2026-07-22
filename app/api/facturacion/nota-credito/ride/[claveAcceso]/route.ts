import { NextResponse }                       from "next/server";
import { requireFacturacionSession }          from "@/lib/facturacion/api-auth";
import { obtenerAdjuntoNotaCreditoPorClave }  from "@/lib/facturacion/notaCredito/airtable";

export const dynamic = "force-dynamic";

// GET /api/facturacion/nota-credito/ride/[claveAcceso] — sirve el RIDE PDF de
// la NC. El adjunto vive en el registro de Airtable (a diferencia de las
// facturas, las NC no se respaldan en disco/Blob todavía).
export async function GET(_req: Request, { params }: { params: Promise<{ claveAcceso: string }> }) {
  const { response } = await requireFacturacionSession();
  if (response) return response;

  const { claveAcceso } = await params;
  const adjunto = await obtenerAdjuntoNotaCreditoPorClave(claveAcceso, "RIDE PDF");
  if (!adjunto) return NextResponse.json({ success: false, error: "RIDE no encontrado" }, { status: 404 });

  const res = await fetch(adjunto.url);
  if (!res.ok) return NextResponse.json({ success: false, error: "No se pudo obtener el RIDE" }, { status: 502 });

  const buffer = Buffer.from(await res.arrayBuffer());
  return new NextResponse(buffer, {
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `inline; filename="${adjunto.filename}"`,
    },
  });
}

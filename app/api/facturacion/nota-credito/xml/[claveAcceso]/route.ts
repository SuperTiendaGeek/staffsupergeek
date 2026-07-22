import { NextResponse }                       from "next/server";
import { requireFacturacionSession }          from "@/lib/facturacion/api-auth";
import { obtenerAdjuntoNotaCreditoPorClave }  from "@/lib/facturacion/notaCredito/airtable";

export const dynamic = "force-dynamic";

// GET /api/facturacion/nota-credito/xml/[claveAcceso] — sirve el XML autorizado de la NC.
export async function GET(_req: Request, { params }: { params: Promise<{ claveAcceso: string }> }) {
  const { response } = await requireFacturacionSession();
  if (response) return response;

  const { claveAcceso } = await params;
  const adjunto = await obtenerAdjuntoNotaCreditoPorClave(claveAcceso, "XML Autorizado");
  if (!adjunto) return NextResponse.json({ success: false, error: "XML no encontrado" }, { status: 404 });

  const res = await fetch(adjunto.url);
  if (!res.ok) return NextResponse.json({ success: false, error: "No se pudo obtener el XML" }, { status: 502 });

  const buffer = Buffer.from(await res.arrayBuffer());
  return new NextResponse(buffer, {
    headers: {
      "Content-Type":        "text/xml",
      "Content-Disposition": `attachment; filename="${adjunto.filename}"`,
    },
  });
}

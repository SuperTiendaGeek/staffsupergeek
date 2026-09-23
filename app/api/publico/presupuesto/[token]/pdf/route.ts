import { NextResponse } from "next/server";
import { pdfPublico } from "@/lib/tecnicos/presupuesto/enlace";
import { origenPublico } from "@/lib/tecnicos/presupuesto/origen";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// PDF del presupuesto desde el enlace público (sin login; lo protege el token).
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const r = await pdfPublico(token, origenPublico(request));
    if (!r) return NextResponse.json({ success: false, error: "Este enlace no existe." }, { status: 404 });
    return new NextResponse(Buffer.from(r.pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${r.nombre}"`, "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
    });
  } catch (e) {
    console.error("[presupuesto público pdf]", e);
    return NextResponse.json({ success: false, error: "No pudimos generar el PDF." }, { status: 500 });
  }
}

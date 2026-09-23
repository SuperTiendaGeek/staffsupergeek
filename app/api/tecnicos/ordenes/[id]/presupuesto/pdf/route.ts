import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { pdfParaTaller } from "@/lib/tecnicos/presupuesto/enlace";
import { origenPublico } from "@/lib/tecnicos/presupuesto/origen";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET → PDF del presupuesto. Asegura el enlace de aprobación (lo crea o lo
// renueva si venció) porque va impreso al pie con su QR.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireTecnicosSession();
  if (response) return response;
  const { id } = await params;
  try {
    const { pdf, nombre } = await pdfParaTaller(id, origenPublico(request));
    return new NextResponse(Buffer.from(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${nombre}"`, "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("[presupuesto pdf]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "No se pudo generar el PDF" }, { status: 500 });
  }
}

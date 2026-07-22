import { NextResponse }              from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { listarNotasCredito }        from "@/lib/facturacion/notaCredito/airtable";

export const dynamic = "force-dynamic";

// GET /api/facturacion/nota-credito/historial?cliente=&numero=&estado=&offset=
export async function GET(request: Request) {
  const { response } = await requireFacturacionSession();
  if (response) return response;

  const q = new URL(request.url).searchParams;
  try {
    const data = await listarNotasCredito({
      cliente: q.get("cliente")?.trim() || undefined,
      numero:  q.get("numero")?.trim() || undefined,
      estado:  q.get("estado")?.trim() || undefined,
      offset:  q.get("offset")?.trim() || undefined,
    });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error("[/api/facturacion/nota-credito/historial]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Error al listar notas de crédito" },
      { status: 500 }
    );
  }
}

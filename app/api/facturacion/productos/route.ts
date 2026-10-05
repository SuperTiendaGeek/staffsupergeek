import { NextResponse } from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { buscarProductos } from "@/lib/facturacion/airtable/productos";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { response } = await requireFacturacionSession();
  if (response) return response;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  // Reserva y Proforma piden `incluirEnCamino=1`: se puede apartar o cotizar
  // lo que todavía no llega. Factura y Recibo no lo piden: solo en tienda.
  const incluirEnCamino = searchParams.get("incluirEnCamino") === "1";

  try {
    const data = await buscarProductos(q, 8, { incluirEnCamino });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error("[/api/facturacion/productos GET]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Error buscando productos" },
      { status: 500 }
    );
  }
}

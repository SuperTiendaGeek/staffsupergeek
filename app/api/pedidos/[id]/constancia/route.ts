import { NextResponse } from "next/server";
import { fetchCotizacionById } from "@/lib/cotizaciones/airtable";
import { fetchPedidoById } from "@/lib/pedidos/airtable";
import { generateConstanciaPedidoPdf } from "@/lib/pedidos/constancia-pdf";
import { requirePedidosSession } from "@/lib/pedidos/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function filenameSafe(value: string) {
  return value
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function GET(request: Request, { params }: Params) {
  const { response } = await requirePedidosSession();
  if (response) return response;

  const { id } = await params;
  const url = new URL(request.url);
  const download = url.searchParams.get("download") === "1";

  try {
    const pedido = await fetchPedidoById(id);
    if (!pedido) {
      return NextResponse.json({ success: false, error: "Pedido no encontrado." }, { status: 404 });
    }

    const cotizacion = pedido.cotizacionId ? await fetchCotizacionById(pedido.cotizacionId) : null;
    const pdfBytes = await generateConstanciaPedidoPdf({
      pedido,
      cotizacion,
      emitidoEn: new Date(),
    });
    const code = pedido.codigo || pedido.identificador || pedido.id;
    const filename = `constancia-pedido-${filenameSafe(code) || pedido.id}.pdf`;
    const body = new ArrayBuffer(pdfBytes.byteLength);
    new Uint8Array(body).set(pdfBytes);

    return new Response(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error al generar constancia de pedido:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "No se pudo generar la constancia." },
      { status: 500 }
    );
  }
}

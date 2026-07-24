import { NextResponse }              from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { obtenerCuerpoDocumento }    from "@/lib/facturacion/documentos/detalle";
import type { TipoDocumento }        from "@/lib/facturacion/documentos/tipos";

export const dynamic = "force-dynamic";

const TIPOS_VALIDOS: TipoDocumento[] = ["factura", "recibo", "proforma", "notaCredito"];

// GET /api/facturacion/documentos/[tipo]/[recordId] — cuerpo del documento
// (ítems + desglose + forma de pago) para el visualizador flotante.
export async function GET(_req: Request, { params }: { params: Promise<{ tipo: string; recordId: string }> }) {
  const { response } = await requireFacturacionSession();
  if (response) return response;

  const { tipo, recordId } = await params;
  if (!TIPOS_VALIDOS.includes(tipo as TipoDocumento)) {
    return NextResponse.json({ success: false, error: "Tipo de documento inválido" }, { status: 400 });
  }

  try {
    const data = await obtenerCuerpoDocumento(tipo as TipoDocumento, recordId);
    if (!data) return NextResponse.json({ success: false, error: "Documento no encontrado" }, { status: 404 });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error("[/api/facturacion/documentos/[tipo]/[recordId] GET]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Error al cargar el detalle" }, { status: 500 });
  }
}

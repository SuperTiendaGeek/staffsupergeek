import { NextResponse } from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { obtenerDocumentoVisor } from "@/lib/facturacion/documentos/visor";
import { TIPOS_VISOR, type TipoVisor } from "@/lib/facturacion/documentos/visor-tipos";

export const dynamic = "force-dynamic";

// GET /api/facturacion/visor/[tipo]/[recordId] — el mismo documento del visor
// (components/documentos/DocumentoModal) para la pantalla de Facturación.
export async function GET(_req: Request, { params }: { params: Promise<{ tipo: string; recordId: string }> }) {
  const { response } = await requireFacturacionSession();
  if (response) return response;

  const { tipo, recordId } = await params;
  if (!TIPOS_VISOR.includes(tipo as TipoVisor) || !recordId?.startsWith("rec")) {
    return NextResponse.json({ success: false, error: "Documento inválido" }, { status: 400 });
  }
  try {
    const data = await obtenerDocumentoVisor(tipo as TipoVisor, recordId, { facturacion: true });
    if (!data) return NextResponse.json({ success: false, error: "Documento no encontrado" }, { status: 404 });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error("[/api/facturacion/visor GET]", e);
    return NextResponse.json({ success: false, error: "No se pudo cargar el documento." }, { status: 500 });
  }
}

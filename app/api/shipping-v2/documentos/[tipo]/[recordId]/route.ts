import { NextResponse } from "next/server";
import { canAccessApp } from "@/lib/apps";
import { getShippingV2AccessContextForSession } from "@/lib/shipping-v2/airtable";
import { requireShippingV2Session } from "@/lib/shipping-v2/auth";
import { obtenerDocumentoVisor } from "@/lib/facturacion/documentos/visor";
import { TIPOS_VISOR, type TipoVisor } from "@/lib/facturacion/documentos/visor-tipos";

export const dynamic = "force-dynamic";

// GET /api/shipping-v2/documentos/[tipo]/[recordId] — un documento (factura,
// recibo, proforma, nota de crédito o reserva) para el visor que se abre desde
// el Kardex y la ficha del artículo. Solo personal de la tienda (el proveedor
// con portal no). Imprimir/PDF/XML solo si la sesión tiene Facturación.
export async function GET(_req: Request, { params }: { params: Promise<{ tipo: string; recordId: string }> }) {
  const { response, session } = await requireShippingV2Session();
  if (response || !session) return response ?? NextResponse.json({ success: false, error: "No autenticado" }, { status: 401 });
  const access = await getShippingV2AccessContextForSession(session);
  if (!access.isAdmin) return NextResponse.json({ success: false, error: "Acceso denegado" }, { status: 403 });

  const { tipo, recordId } = await params;
  if (!TIPOS_VISOR.includes(tipo as TipoVisor) || !recordId?.startsWith("rec")) {
    return NextResponse.json({ success: false, error: "Documento inválido" }, { status: 400 });
  }
  try {
    const data = await obtenerDocumentoVisor(tipo as TipoVisor, recordId, { facturacion: canAccessApp(session, "Facturación") });
    if (!data) return NextResponse.json({ success: false, error: "Documento no encontrado" }, { status: 404 });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error("[/api/shipping-v2/documentos GET]", e);
    return NextResponse.json({ success: false, error: "No se pudo cargar el documento." }, { status: 500 });
  }
}

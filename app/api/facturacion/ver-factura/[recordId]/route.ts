import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/session";
import { obtenerFacturaSoloLectura } from "@/lib/facturacion/documentos/facturaSoloLectura";

export const dynamic = "force-dynamic";

// GET /api/facturacion/ver-factura/[recordId] — detalle de solo lectura de
// una factura, para el modal que se abre desde /tecnicos/mantenimientos
// (VerFacturaModal). A propósito NO exige permiso de Facturación — solo
// sesión activa — para que cualquier miembro del staff logueado pueda
// consultar la factura ligada a un ciclo de mantenimiento sin toparse con
// un bloqueo por permisos.
export async function GET(_req: Request, { params }: { params: Promise<{ recordId: string }> }) {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ success: false, error: "No autenticado" }, { status: 401 });
  }

  const { recordId } = await params;
  if (!recordId) {
    return NextResponse.json({ success: false, error: "Falta el id de la factura" }, { status: 400 });
  }

  try {
    const data = await obtenerFacturaSoloLectura(recordId);
    if (!data) {
      return NextResponse.json({ success: false, error: "Factura no encontrada" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error al obtener factura de solo lectura:", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

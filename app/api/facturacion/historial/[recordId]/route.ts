import { NextResponse } from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { obtenerFactura, eliminarRegistroFactura } from "@/lib/facturacion/airtable/facturas";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ recordId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { response } = await requireFacturacionSession();
  if (response) return response;

  const { recordId } = await params;
  const factura = await obtenerFactura(recordId);
  if (!factura) {
    return NextResponse.json({ success: false, error: "Factura no encontrada" }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: factura });
}

// Solo borradores pueden eliminarse
export async function DELETE(_req: Request, { params }: Params) {
  const { response } = await requireFacturacionSession();
  if (response) return response;

  const { recordId } = await params;
  const factura = await obtenerFactura(recordId);

  if (!factura) {
    return NextResponse.json({ success: false, error: "Factura no encontrada" }, { status: 404 });
  }
  if (factura.estado !== "BORRADOR") {
    return NextResponse.json(
      { success: false, error: "Solo los borradores pueden eliminarse" },
      { status: 403 }
    );
  }

  try {
    await eliminarRegistroFactura(recordId);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Error al eliminar" },
      { status: 500 }
    );
  }
}

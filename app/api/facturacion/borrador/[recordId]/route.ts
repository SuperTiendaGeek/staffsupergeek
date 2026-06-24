import { NextResponse }              from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { obtenerFactura, actualizarBorrador, eliminarRegistroFactura } from "@/lib/facturacion/airtable/facturas";
import { getFacturacionConfig }      from "@/lib/facturacion/config";
import type { BorradorInput }        from "@/lib/facturacion/airtable/facturas";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ recordId: string }> };

// PATCH — actualizar un borrador existente
export async function PATCH(request: Request, { params }: Params) {
  const { response } = await requireFacturacionSession();
  if (response) return response;

  const { recordId } = await params;
  const factura = await obtenerFactura(recordId);

  if (!factura) {
    return NextResponse.json({ success: false, error: "Borrador no encontrado" }, { status: 404 });
  }
  if (factura.estado !== "BORRADOR") {
    return NextResponse.json({ success: false, error: "Solo los borradores pueden actualizarse" }, { status: 403 });
  }

  let body: Partial<BorradorInput>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Body JSON inválido" }, { status: 400 });
  }

  const cfg = getFacturacionConfig();

  const input: BorradorInput = {
    ambiente:              cfg.ambiente,
    clienteNombre:         body.clienteNombre         ?? factura.clienteNombre,
    clienteIdentificacion: body.clienteIdentificacion ?? factura.clienteIdentificacion,
    clienteCorreo:         (body.clienteCorreo ?? factura.clienteCorreo) || undefined,
    subtotal:              body.subtotal               ?? factura.subtotal,
    iva:                   body.iva                   ?? factura.iva,
    total:                 body.total                 ?? factura.total,
    lineasJson:            body.lineasJson             ?? factura.lineasJson,
  };

  try {
    await actualizarBorrador(recordId, input);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Error al actualizar borrador" },
      { status: 500 }
    );
  }
}

// DELETE — eliminar borrador
export async function DELETE(_req: Request, { params }: Params) {
  const { response } = await requireFacturacionSession();
  if (response) return response;

  const { recordId } = await params;
  const factura = await obtenerFactura(recordId);

  if (!factura) {
    return NextResponse.json({ success: false, error: "Borrador no encontrado" }, { status: 404 });
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
      { success: false, error: e instanceof Error ? e.message : "Error al eliminar borrador" },
      { status: 500 }
    );
  }
}

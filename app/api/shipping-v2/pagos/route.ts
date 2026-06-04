import { NextResponse } from "next/server";
import { createShippingV2Pago, getShippingV2PagosWorkspace } from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";

export const dynamic = "force-dynamic";

function parseList(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

export async function GET() {
  const { response } = await requireShippingV2Session();
  if (response) return response;
  try {
    const workspace = await getShippingV2PagosWorkspace();
    return NextResponse.json({ success: true, data: workspace, ...workspace });
  } catch (error) {
    console.error("Error al obtener pagos Shipping V2:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  try {
    const body = await request.json().catch(() => ({}));
    const pago = await createShippingV2Pago({
      estadoPago: String(body.estadoPago ?? "Borrador"),
      proveedorId: String(body.proveedorId ?? ""),
      itemIds: parseList(body.itemIds),
      regalosIds: parseList(body.regalosIds),
      fechaVencimientoSugerida: String(body.fechaVencimientoSugerida ?? ""),
      observacion: String(body.observacion ?? ""),
      fechaPagoReal: String(body.fechaPagoReal ?? ""),
      metodoPago: String(body.metodoPago ?? ""),
      cuentaOrigen: String(body.cuentaOrigen ?? ""),
      transaccionId: String(body.transaccionId ?? ""),
      comprobanteUrl: String(body.comprobanteUrl ?? ""),
    }, { registradoPor: getShippingV2SessionName(session) });
    return NextResponse.json({ success: true, data: pago, recordId: pago.id }, { status: 201 });
  } catch (error) {
    console.error("Error al crear pago Shipping V2:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
}

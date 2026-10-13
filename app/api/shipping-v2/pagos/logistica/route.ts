import { NextResponse } from "next/server";
import { canShippingV2, getShippingV2AccessContextForSession, registrarPagoLogisticaShippingV2 } from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";

export const dynamic = "force-dynamic";

/** Punto 9c: registrar el pago de un flete, arancel u otro gasto de una caja o un artículo suelto. */
export async function POST(request: Request) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  try {
    const access = await getShippingV2AccessContextForSession(session);
    if (!canShippingV2(access, "canManagePayments")) {
      return NextResponse.json({ success: false, error: "No tienes permiso para registrar pagos de Shipping." }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const resultado = await registrarPagoLogisticaShippingV2({
      concepto: String(body.concepto ?? ""),
      packingId: String(body.packingId ?? ""),
      itemId: String(body.itemId ?? ""),
      monto: Number(body.monto),
      proveedorId: String(body.proveedorId ?? ""),
      pagadoA: String(body.pagadoA ?? ""),
      fechaPagoReal: String(body.fechaPagoReal ?? ""),
      metodoPago: String(body.metodoPago ?? ""),
      cuentaOrigen: String(body.cuentaOrigen ?? ""),
      transaccionId: String(body.transaccionId ?? ""),
      comprobanteUrl: String(body.comprobanteUrl ?? ""),
      orden: String(body.orden ?? ""),
    }, { registradoPor: getShippingV2SessionName(session), access });
    return NextResponse.json({ success: true, data: resultado.pago, aviso: resultado.aviso || undefined }, { status: 201 });
  } catch (error) {
    console.error("Error al registrar pago de logística Shipping V2:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
}

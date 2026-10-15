import { NextResponse } from "next/server";
import { canShippingV2, createShippingV2OrdenCompra, getShippingV2AccessContextForSession } from "@/lib/shipping-v2/airtable";
import { getShippingV2SessionName, requireShippingV2Session } from "@/lib/shipping-v2/auth";

export const dynamic = "force-dynamic";

/**
 * Punto 9d (14-oct-2026): crea la orden de compra (cabecera). "Registrar
 * compra" la crea primero, luego cada artículo dentro de ella y al final su
 * pago, en llamadas separadas para no pasar el tiempo límite con 30 artículos.
 */
export async function POST(request: Request) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  try {
    const access = await getShippingV2AccessContextForSession(session);
    if (!canShippingV2(access, "canEditItems")) {
      return NextResponse.json({ success: false, error: "No tienes permiso para registrar compras." }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const orden = await createShippingV2OrdenCompra(
      {
        proveedorId: String(body.proveedorId ?? ""),
        numeroProveedor: String(body.numeroProveedor ?? ""),
        fechaCompra: String(body.fechaCompra ?? ""),
        observaciones: String(body.observaciones ?? ""),
      },
      { registradoPor: getShippingV2SessionName(session), access }
    );
    return NextResponse.json({ success: true, data: orden }, { status: 201 });
  } catch (error) {
    console.error("Error al crear la orden de compra:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
}

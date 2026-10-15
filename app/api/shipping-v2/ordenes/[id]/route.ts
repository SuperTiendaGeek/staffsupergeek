import { NextResponse } from "next/server";
import { eliminarOrdenCompraVacia, getShippingV2AccessContextForSession, getShippingV2OrdenCompraById } from "@/lib/shipping-v2/airtable";
import { requireShippingV2Session } from "@/lib/shipping-v2/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Punto 9d: una orden de compra con sus artículos, sus pagos y lo que falta. */
export async function GET(_request: Request, { params }: Params) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  try {
    const { id } = await params;
    const access = await getShippingV2AccessContextForSession(session);
    const orden = await getShippingV2OrdenCompraById(id, access);
    return NextResponse.json({ success: true, data: orden });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
}

/** Borra una orden VACÍA (sin artículos ni pagos), p. ej. si falló el primer artículo al registrar. */
export async function DELETE(_request: Request, { params }: Params) {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  try {
    const { id } = await params;
    const access = await getShippingV2AccessContextForSession(session);
    const resultado = await eliminarOrdenCompraVacia(id, { access });
    return NextResponse.json({ success: true, data: resultado });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
}

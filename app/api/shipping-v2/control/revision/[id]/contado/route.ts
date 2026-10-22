import { NextResponse } from "next/server";
import { anotarConteoAsuntoShippingV2 } from "@/lib/shipping-v2/airtable";
import { accesoControl, errorJson } from "../../../acceso";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Punto 10c-4: anotar cuántas hay en la tienda (Staff y Administrador). No cambia el stock. */
export async function POST(request: Request, { params }: Params) {
  const a = await accesoControl();
  if (a.response) return a.response;
  const { id } = await params;
  try {
    const body = await request.json().catch(() => ({}));
    return NextResponse.json({ success: true, data: await anotarConteoAsuntoShippingV2(id, Number(body.n), { actor: a.actor }) });
  } catch (error) {
    return errorJson(error, "Error al anotar lo contado:");
  }
}

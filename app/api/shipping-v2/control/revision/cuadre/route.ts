import { NextResponse } from "next/server";
import { getShippingV2CuadreItem } from "@/lib/shipping-v2/airtable";
import { accesoControl, errorJson } from "../../acceso";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Punto 10c-4: los números actuales de un registro para cuadrarlo (?itemId=rec…). */
export async function GET(request: Request) {
  const a = await accesoControl();
  if (a.response) return a.response;
  try {
    const itemId = new URL(request.url).searchParams.get("itemId") ?? "";
    return NextResponse.json({ success: true, data: await getShippingV2CuadreItem(itemId) });
  } catch (error) {
    return errorJson(error, "Error al leer el artículo para cuadrar:");
  }
}

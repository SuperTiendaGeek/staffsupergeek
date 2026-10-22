import { NextResponse } from "next/server";
import { getShippingV2CambiosCodigo } from "@/lib/shipping-v2/airtable";
import { accesoControl, errorJson } from "../acceso";

export const dynamic = "force-dynamic";

// Punto 10c-3: reporte "Cambios de código" (antes → ahora).
export async function GET() {
  const a = await accesoControl();
  if (a.response) return a.response;
  try {
    return NextResponse.json({ success: true, data: await getShippingV2CambiosCodigo() });
  } catch (error) {
    return errorJson(error, "Error al leer los cambios de código:");
  }
}

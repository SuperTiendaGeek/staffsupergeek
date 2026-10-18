import { NextResponse } from "next/server";
import { revisarInventarioShippingV2 } from "@/lib/shipping-v2/airtable";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Proceso diario (Vercel Cron, ver vercel.json) — auditoría Shipping V2,
// punto 10c-1 (18-oct-2026): revisa el inventario cada mañana y deja los
// asuntos en la pestaña Control. Vercel manda `Authorization: Bearer
// $CRON_SECRET`; sin esa variable la ruta rechaza cualquier llamada.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const resumen = await revisarInventarioShippingV2({ actor: "proceso diario" });
    return NextResponse.json({ success: true, ...resumen });
  } catch (error) {
    console.error("[cron/revision-inventario] Error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error desconocido" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getShippingV2AccessContextForSession, getShippingV2ResumenPestanas } from "@/lib/shipping-v2/airtable";
import { requireShippingV2Session } from "@/lib/shipping-v2/auth";
import { compartirLectura } from "@/lib/compartir-lectura";

export const dynamic = "force-dynamic";

// Pendientes que muestra la barra de pestañas de Shipping V2 (punto 2).
export async function GET() {
  const { response, session } = await requireShippingV2Session();
  if (response) return response;
  try {
    const access = await getShippingV2AccessContextForSession(session);
    // Se pide en cada cambio de pestaña (31 llamadas): quien llega mientras otra
    // lectura igual sigue en curso espera esa misma (incidente 24-nov). El resumen
    // es igual para todo el personal; un proveedor no lo ve.
    const compartido = access.providerId ? null : await compartirLectura("shipping-v2:resumen-pestanas", () => getShippingV2ResumenPestanas(access));
    const data = compartido ? { ...compartido } : null;
    // Fase 2: cuántas solicitudes esperan compra (solo lo ve quien compra).
    if (data && access.isAdmin && access.permissions.canEditItems) {
      const { solicitudesEnEstados } = await import("@/lib/compras/airtable");
      data.porComprar = await compartirLectura("compras:por-comprar", async () => (await solicitudesEnEstados(["Por comprar"]).catch(() => [])).length);
    }
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[/api/shipping-v2/pestanas]", error);
    return NextResponse.json({ success: false, data: null }, { status: 200 });
  }
}

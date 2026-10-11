import "server-only";

// Lógica compartida de las rutas del cartel al vender (punto 8b). Cada módulo
// (Facturación, Técnicos) la expone con SU propia sesión.

import { NextResponse } from "next/server";
import { cerrarNovedadesPorVenta, getNovedadesParaVenta, type CierrePorVenta } from "@/lib/shipping-v2/airtable";

export async function responderNovedadesParaVenta(request: Request) {
  const itemId = new URL(request.url).searchParams.get("itemId")?.trim() ?? "";
  if (!/^rec[A-Za-z0-9]{14}$/.test(itemId)) return NextResponse.json({ success: true, data: [] });
  try {
    return NextResponse.json({ success: true, data: await getNovedadesParaVenta(itemId) });
  } catch (error) {
    console.error("[novedades-venta GET]", error);
    return NextResponse.json({ success: false, error: "No se pudieron revisar las novedades del artículo." }, { status: 500 });
  }
}

export async function responderCierrePorVenta(request: Request, actor: string) {
  try {
    const body = (await request.json().catch(() => ({}))) as { documento?: unknown; cierres?: unknown };
    const cierres: CierrePorVenta[] = Array.isArray(body.cierres)
      ? body.cierres
        .filter((c): c is Record<string, unknown> => Boolean(c) && typeof c === "object")
        .map((c) => ({
          novedadId: String(c.novedadId ?? ""),
          itemId: String(c.itemId ?? ""),
          texto: String(c.texto ?? ""),
          reclamoContinua: c.reclamoContinua === true,
        }))
        .slice(0, 50)
      : [];
    if (!cierres.length) return NextResponse.json({ success: true, data: { cerradas: 0, errores: [] } });
    const resultado = await cerrarNovedadesPorVenta(cierres, { documento: String(body.documento ?? ""), actor });
    return NextResponse.json({ success: true, data: resultado });
  } catch (error) {
    console.error("[novedades-venta POST]", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { listarFacturas }            from "@/lib/facturacion/airtable/facturas";
import type { FiltrosHistorial }     from "@/lib/facturacion/airtable/facturas";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { response } = await requireFacturacionSession();
  if (response) return response;

  const { searchParams } = new URL(request.url);

  const filtros: FiltrosHistorial = {
    fechaDesde: searchParams.get("fechaDesde") ?? undefined,
    fechaHasta: searchParams.get("fechaHasta") ?? undefined,
    cliente:    searchParams.get("cliente")    ?? undefined,
    numero:     searchParams.get("numero")     ?? undefined,
    estado:     (searchParams.get("estado")    ?? undefined) as FiltrosHistorial["estado"],
    ambiente:   (searchParams.get("ambiente")  ?? undefined) as FiltrosHistorial["ambiente"],
    offset:     searchParams.get("offset")     ?? undefined,
    pageSize:   searchParams.get("pageSize")   ? parseInt(searchParams.get("pageSize")!, 10) : 50,
  };

  try {
    const resultado = await listarFacturas(filtros);
    return NextResponse.json({ success: true, data: resultado });
  } catch (e) {
    console.error("[/api/facturacion/historial GET]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Error al listar facturas" },
      { status: 500 }
    );
  }
}

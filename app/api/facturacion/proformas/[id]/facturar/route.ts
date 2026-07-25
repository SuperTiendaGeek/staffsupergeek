import { NextResponse }              from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { obtenerProformaPorId, marcarProformaFacturada } from "@/lib/facturacion/proformas/airtable";
import type { ProformaCliente, LineaProforma } from "@/lib/facturacion/proformas/types";

export const dynamic = "force-dynamic";

// GET  — datos de la proforma para precargar el formulario de factura.
// POST — marca la proforma como "Facturada" (se llama tras emitir la factura).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireFacturacionSession();
  if (response) return response;

  const { id } = await params;
  const proforma = await obtenerProformaPorId(id);
  if (!proforma) return NextResponse.json({ success: false, error: "Proforma no encontrada" }, { status: 404 });

  let cliente: ProformaCliente | null = null;
  let lineas: LineaProforma[] = [];
  try {
    const parsed = JSON.parse(proforma.lineasJson || "{}");
    if (parsed?.cliente && typeof parsed.cliente === "object") cliente = parsed.cliente as ProformaCliente;
    if (Array.isArray(parsed?.lineas)) lineas = parsed.lineas as LineaProforma[];
  } catch { /* ignore */ }

  if (!cliente || lineas.length === 0) {
    return NextResponse.json({ success: false, error: "La proforma no tiene datos suficientes para facturar" }, { status: 400 });
  }

  return NextResponse.json({ success: true, data: { numero: proforma.numero, estado: proforma.estado, cliente, lineas } });
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireFacturacionSession();
  if (response) return response;

  const { id } = await params;
  try {
    await marcarProformaFacturada(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[/api/facturacion/proformas/[id]/facturar POST]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Error al marcar la proforma" }, { status: 500 });
  }
}

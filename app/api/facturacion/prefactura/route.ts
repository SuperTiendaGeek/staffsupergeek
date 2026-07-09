import { NextResponse }              from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { construirPreFactura }       from "@/lib/facturacion/gancho/traductor";

export const dynamic = "force-dynamic";

// GET /api/facturacion/prefactura?orden=recordId | ?operacion=recordId
//
// Traduce la cuenta unificada de una orden/operación a una pre-factura
// editable (Fase 16 PR2). Si la orden/operación ya tiene una factura
// vinculada en un estado que no sea BORRADOR/ANULADA, o si algún item no
// está listo (no Reservado o ya tiene una Factura previa), responde
// bloqueado con el detalle — no arma ninguna pre-factura en ese caso.
export async function GET(request: Request) {
  const { response } = await requireFacturacionSession();
  if (response) return response;

  const { searchParams } = new URL(request.url);
  const ordenId     = searchParams.get("orden")?.trim();
  const operacionId = searchParams.get("operacion")?.trim();

  if (!ordenId && !operacionId) {
    return NextResponse.json(
      { success: false, error: "Falta el parámetro 'orden' o 'operacion'" },
      { status: 400 }
    );
  }
  if (ordenId && operacionId) {
    return NextResponse.json(
      { success: false, error: "Solo se puede pasar 'orden' o 'operacion', no ambos" },
      { status: 400 }
    );
  }

  try {
    const resultado = ordenId
      ? await construirPreFactura({ ordenId })
      : await construirPreFactura({ operacionId: operacionId! });
    return NextResponse.json({ success: true, data: resultado });
  } catch (e) {
    console.error("[/api/facturacion/prefactura GET]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Error al construir la pre-factura" },
      { status: 500 }
    );
  }
}

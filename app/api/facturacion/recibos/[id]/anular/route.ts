import { NextResponse }              from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { obtenerReciboPorId, marcarReciboAnulado } from "@/lib/facturacion/recibos/airtable";
import { revertirInventarioRecibo, revertirIngresoRecibo } from "@/lib/facturacion/recibos/efectos";
import { getFacturacionConfig }      from "@/lib/facturacion/config";

export const dynamic = "force-dynamic";

// POST /api/facturacion/recibos/[id]/anular
// Anulación interna simple: marca Anulado, devuelve el stock y revierte el
// ingreso en el libro (ambos guardados a producción por su ambiente).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireFacturacionSession();
  if (response || !session) return response ?? NextResponse.json({ success: false, error: "Sin sesión" }, { status: 401 });

  const { id } = await params;
  const recibo = await obtenerReciboPorId(id);
  if (!recibo) return NextResponse.json({ success: false, error: "Recibo no encontrado" }, { status: 404 });
  if (recibo.estado === "Anulado") return NextResponse.json({ success: false, error: "El recibo ya está anulado" }, { status: 400 });

  const cfg = getFacturacionConfig();

  try {
    await marcarReciboAnulado(id);
    // Reverso de inventario: devuelve el stock.
    await revertirInventarioRecibo({ reciboRecordId: id, lineas: recibo.lineas, ambiente: cfg.ambiente }).catch((e) => console.error("[anular recibo] inventario:", e));
    // Reverso contable: Egreso categoría "Devolución" con la forma de pago original.
    await revertirIngresoRecibo({
      numeroRecibo: recibo.numero, total: recibo.total, formaPago: recibo.formaPago,
      clienteRecordId: recibo.clienteRecordId, registradoPor: session.user.nombre || session.user.email || "Portal", ambiente: cfg.ambiente,
    }).catch((e) => console.error("[anular recibo] contable:", e));

    return NextResponse.json({ success: true, data: { numero: recibo.numero } });
  } catch (e) {
    console.error("[anular recibo]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Error al anular el recibo" }, { status: 500 });
  }
}

import { NextResponse }              from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { obtenerReciboPorId, marcarReciboAnulado } from "@/lib/facturacion/recibos/airtable";
import { revertirInventarioRecibo, revertirIngresoRecibo, revertirProductosDigitalesRecibo } from "@/lib/facturacion/recibos/efectos";
import { revertirPuenteRecibo } from "@/lib/finanzas/puentes/recibo";
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
    const registradoPor = session.user.nombre || session.user.email || "Portal";

    await marcarReciboAnulado(id);
    // Reverso de inventario: devuelve el stock.
    await revertirInventarioRecibo({ reciboRecordId: id, lineas: recibo.lineas, ambiente: cfg.ambiente }).catch((e) => console.error("[anular recibo] inventario:", e));
    // Productos digitales: vuelven a Disponible y sueltan el enlace.
    await revertirProductosDigitalesRecibo({ reciboRecordId: id, lineas: recibo.lineas, ambiente: cfg.ambiente }).catch((e) => console.error("[anular recibo] productos digitales:", e));

    if (recibo.origen) {
      // Recibo con origen: NUNCA revertir el total. Los abonos previos ya
      // estaban registrados antes de emitirlo y ese dinero no regresa al
      // cliente por anular el documento — solo se devuelve el saldo que este
      // recibo llegó a registrar (ver revertirPuenteRecibo).
      await revertirPuenteRecibo({
        reciboRecordId: id, numeroRecibo: recibo.numero, movimientoIds: recibo.movimientoIds,
        clienteRecordId: recibo.clienteRecordId, registradoPor, ambiente: cfg.ambiente,
      }).catch((e) => console.error("[anular recibo] contable (origen):", e));
    } else {
      // Mostrador: Egreso categoría "Devolución" por el total, con la forma
      // de pago original.
      await revertirIngresoRecibo({
        numeroRecibo: recibo.numero, total: recibo.total, formaPago: recibo.formaPago,
        clienteRecordId: recibo.clienteRecordId, registradoPor, ambiente: cfg.ambiente,
      }).catch((e) => console.error("[anular recibo] contable:", e));
    }

    return NextResponse.json({ success: true, data: { numero: recibo.numero } });
  } catch (e) {
    console.error("[anular recibo]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Error al anular el recibo" }, { status: 500 });
  }
}

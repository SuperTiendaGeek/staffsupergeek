import { NextResponse }              from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { obtenerReciboPorId }        from "@/lib/facturacion/recibos/airtable";
import { descontarInventarioRecibo } from "@/lib/facturacion/recibos/efectos";
import { planReintentoInventarioRecibo } from "@/lib/facturacion/recibos/reintento";
import { getFacturacionConfig }      from "@/lib/facturacion/config";
import { withLock }                  from "@/lib/concurrencia";

export const dynamic     = "force-dynamic";
export const maxDuration = 60;

// POST /api/facturacion/recibos/[id]/sincronizar
// "↺ Reintentar descargo" del historial de recibos (punto 10a de la auditoría
// Shipping V2, 16-oct-2026). Repite el descuento de inventario de un recibo
// cuyo descargo quedó en ERROR o PENDIENTE. Nunca descuenta dos veces: ver las
// tres capas de protección en lib/facturacion/recibos/reintento.ts.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireFacturacionSession();
  if (response || !session) return response ?? NextResponse.json({ success: false, error: "Sin sesión" }, { status: 401 });

  const { id } = await params;
  try {
    return await withLock(`recibo-inventario:${id}`, async () => {
      // Se lee DENTRO del turno: si un clic anterior ya terminó, aquí se ve OK.
      const recibo = await obtenerReciboPorId(id);
      if (!recibo) return NextResponse.json({ success: false, error: "Recibo no encontrado" }, { status: 404 });

      const plan = planReintentoInventarioRecibo({
        estado: recibo.estado,
        sincronizacionInventario: recibo.sincronizacionInventario,
        creadoEn: recibo.creadoEn,
      });
      if (plan.accion !== "reintentar") {
        return NextResponse.json({ success: false, error: plan.motivo }, { status: 409 });
      }

      const cfg = getFacturacionConfig();
      const resultado = await descontarInventarioRecibo({
        reciboRecordId: id,
        numeroRecibo:   recibo.numero,
        lineas:         recibo.lineas,
        ambiente:       cfg.ambiente,
        liberaReserva:  !!recibo.origen,
      });
      if (resultado.estado === "ERROR") {
        return NextResponse.json({ success: false, error: resultado.detalle ?? "El descargo volvió a fallar." }, { status: 502 });
      }
      return NextResponse.json({ success: true, data: { numero: recibo.numero } });
    });
  } catch (e) {
    console.error("[/recibos/sincronizar POST]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Error al reintentar el descargo" }, { status: 500 });
  }
}

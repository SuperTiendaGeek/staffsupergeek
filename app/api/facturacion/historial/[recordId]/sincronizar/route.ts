import { NextResponse }              from "next/server";
import { requireFacturacionSession } from "@/lib/facturacion/api-auth";
import { obtenerFactura }            from "@/lib/facturacion/airtable/facturas";
import { completarFacturaAutorizada } from "@/lib/facturacion/gancho/efectosPostAutorizacion";

export const dynamic    = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ recordId: string }> };

// "↺ Reintentar sincronización" / "Completar descargo" del historial.
//
// Completa lo que falte de una factura AUTORIZADA (descargo de inventario,
// vínculo a su orden/operación, ingreso en Finanzas si no tiene ninguno,
// cierre de reserva) con el mismo punto de entrada que usa "Consultar estado"
// — ver lib/facturacion/gancho/efectosPostAutorizacion.ts. Idempotente.
//
// Antes este endpoint rechazaba las facturas de mostrador ("sin origen —
// nada que sincronizar"), aunque el mostrador descuenta inventario desde la
// Fase 17.b, y forzaba liberaReserva=true. Ambas cosas se corrigieron: ahora
// cualquier factura AUTORIZADA con líneas se puede completar, y la reserva
// solo se libera si la factura viene de un origen.
export async function POST(_req: Request, { params }: Params) {
  const { response, session } = await requireFacturacionSession();
  if (response || !session) return response ?? NextResponse.json({ success: false, error: "Sin sesión" }, { status: 401 });

  const { recordId } = await params;
  const factura = await obtenerFactura(recordId);

  if (!factura) {
    return NextResponse.json({ success: false, error: "Factura no encontrada" }, { status: 404 });
  }
  if (factura.estado !== "AUTORIZADO") {
    return NextResponse.json(
      { success: false, error: `Solo se puede sincronizar una factura AUTORIZADA (estado actual: ${factura.estado})` },
      { status: 400 }
    );
  }

  try {
    const resultado = await completarFacturaAutorizada(recordId, session.user.nombre || session.user.email || "Portal");
    if (resultado.accion === "sin-lineas" || resultado.accion === "en-curso") {
      return NextResponse.json({ success: false, error: resultado.motivo }, { status: 409 });
    }
    const avisos: string[] = [];
    if (resultado.accion === "nada" && resultado.motivo) avisos.push(resultado.motivo);
    if (resultado.efectos?.inventario?.estado === "ERROR") {
      avisos.push(`El descargo quedó con errores: ${resultado.efectos.inventario.detalle ?? "revisa el detalle en la factura"}`);
    }
    return NextResponse.json({ success: true, data: { ...resultado, avisos } });
  } catch (e) {
    console.error("[/sincronizar POST]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Error al sincronizar" },
      { status: 500 }
    );
  }
}

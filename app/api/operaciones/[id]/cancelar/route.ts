import { NextResponse } from "next/server";
import { requireOperacionesSession } from "@/lib/operaciones/auth";
import { ErrorCancelacion, cancelarPedidoEspecial, revisarCancelacion } from "@/lib/pedidos-especiales/cancelacion-servidor";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Cancelar un pedido especial (auditoría ops, punto 10C-3a; maqueta 5b).
// GET: etapa (confirmado o no con el proveedor), lo pagado y, para devolver,
//      las cuentas y métodos. POST: cancela y resuelve el dinero en un paso.
export async function GET(_: Request, { params }: Params) {
  const { response, session } = await requireOperacionesSession();
  if (response || !session) return response ?? NextResponse.json({ success: false }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json({ success: true, data: await revisarCancelacion(id, session) });
  } catch (e) {
    if (e instanceof ErrorCancelacion) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    console.error("[pedido/cancelar] revisar", e);
    return NextResponse.json({ success: false, error: "No se pudo revisar el pedido. Intenta de nuevo." }, { status: 503 });
  }
}

export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireOperacionesSession();
  if (response || !session) return response ?? NextResponse.json({ success: false }, { status: 401 });
  const { id } = await params;
  let b: Record<string, unknown> = {};
  try { b = await request.json(); } catch { return NextResponse.json({ success: false, error: "Cuerpo inválido." }, { status: 400 }); }
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const prueba = b.prueba && typeof b.prueba === "object" ? (b.prueba as Record<string, unknown>) : null;
  const reembolso = b.reembolso && typeof b.reembolso === "object" ? (b.reembolso as Record<string, unknown>) : null;
  try {
    const r = await cancelarPedidoEspecial({
      pedidoId: id,
      session,
      motivo: str(b.motivo).slice(0, 300),
      proveedorAcepta: typeof b.proveedorAcepta === "boolean" ? b.proveedorAcepta : null,
      destino: b.destino === "devolver" || b.destino === "saldo_a_favor" ? b.destino : null,
      gastos: typeof b.gastos === "number" ? b.gastos : Number(str(b.gastos).replace(",", ".")) || 0,
      prueba: prueba && str(prueba.base64) ? { nombre: str(prueba.nombre), tipo: str(prueba.tipo), base64: str(prueba.base64) } : null,
      reembolso: reembolso ? { cuentaOrigenId: reembolso.cuentaOrigenId, metodo: reembolso.metodo, transaccionId: reembolso.transaccionId } : null,
    });
    return NextResponse.json({ success: true, data: r });
  } catch (e) {
    if (e instanceof ErrorCancelacion) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    console.error("[pedido/cancelar]", e);
    return NextResponse.json({ success: false, error: "No se pudo cancelar. Intenta de nuevo." }, { status: 500 });
  }
}

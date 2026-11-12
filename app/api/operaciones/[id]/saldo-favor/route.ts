import { NextResponse } from "next/server";
import { requireOperacionesSession } from "@/lib/operaciones/auth";
import { responderAccionSaldo, responderSaldoDeCuenta } from "@/lib/saldo-favor/ruta";
import { confirmarPedidoSiPagado } from "@/lib/pedidos-especiales/enlace";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Saldo a favor del cliente desde el pedido (operación) (auditoría ops, punto 13B).
// GET: cuánto tiene el cliente. POST: pasar el sobrante a saldo a favor,
// devolverlo (solo administrador) o usar el saldo como pago.
export async function GET(_: Request, { params }: Params) {
  const { response, session } = await requireOperacionesSession();
  if (response || !session) return response ?? NextResponse.json({ success: false, error: "Sin sesión" }, { status: 401 });
  const { id } = await params;
  return responderSaldoDeCuenta(session, { tipo: "operacion", recordId: id });
}

export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireOperacionesSession();
  if (response || !session) return response ?? NextResponse.json({ success: false, error: "Sin sesión" }, { status: 401 });
  const { id } = await params;
  const res = await responderAccionSaldo(request, session, { tipo: "operacion", recordId: id });
  // Punto 10A-3: pagar con saldo a favor también confirma un pedido elegido en el enlace.
  if (res.status === 200) {
    const quien = session.user.nombre?.trim() || session.user.email?.trim() || "Portal";
    await confirmarPedidoSiPagado(id, `Pago registrado por ${quien}`).catch((e) => console.error("[saldo-favor operación] confirmar pedido:", e));
  }
  return res;
}

import { NextResponse } from "next/server";
import { requireOperacionesSession } from "@/lib/operaciones/auth";
import { responderAccionSaldo, responderSaldoDeCuenta } from "@/lib/saldo-favor/ruta";

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
  return responderAccionSaldo(request, session, { tipo: "operacion", recordId: id });
}

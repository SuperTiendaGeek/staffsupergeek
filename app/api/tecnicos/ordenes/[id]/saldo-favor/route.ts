import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { responderAccionSaldo, responderSaldoDeCuenta } from "@/lib/saldo-favor/ruta";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Saldo a favor del cliente desde la orden (auditoría ops, punto 13B).
// GET: cuánto tiene el cliente. POST: pasar el sobrante a saldo a favor,
// devolverlo (solo administrador) o usar el saldo como pago.
export async function GET(_: Request, { params }: Params) {
  const { response, session } = await requireTecnicosSession();
  if (response || !session) return response ?? NextResponse.json({ success: false, error: "Sin sesión" }, { status: 401 });
  const { id } = await params;
  return responderSaldoDeCuenta(session, { tipo: "orden", recordId: id });
}

export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireTecnicosSession();
  if (response || !session) return response ?? NextResponse.json({ success: false, error: "Sin sesión" }, { status: 401 });
  const { id } = await params;
  return responderAccionSaldo(request, session, { tipo: "orden", recordId: id });
}

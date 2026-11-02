import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { devolverSaldoDeCliente } from "@/lib/saldo-favor/servidor";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Devolver en dinero el saldo a favor que el cliente ya tiene (auditoría ops,
// punto 13C). Solo administrador.
// POST { monto, cuentaOrigenId, metodo, transaccionId }
export async function POST(request: Request, { params }: Params) {
  const { response, session } = await requireTecnicosSession();
  if (response || !session) return response ?? NextResponse.json({ success: false, error: "Sin sesión" }, { status: 401 });
  const { id } = await params;
  if (!/^rec[A-Za-z0-9]{14}$/.test(id ?? "")) return NextResponse.json({ success: false, error: "Id inválido." }, { status: 400 });
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch {
    return NextResponse.json({ success: false, error: "Cuerpo inválido." }, { status: 400 });
  }
  try {
    const r = await devolverSaldoDeCliente({
      clienteId: id,
      session,
      monto: typeof body.monto === "number" ? body.monto : Number(body.monto),
      solicitud: { cuentaOrigenId: body.cuentaOrigenId, metodo: body.metodo, transaccionId: body.transaccionId },
    });
    if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: r.status });
    const { ok: _ok, warning, ...data } = r;
    return NextResponse.json({ success: true, data, warning: warning ?? null });
  } catch (e) {
    console.error("[clientes] devolver saldo", id, e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Error inesperado." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { anularAbonoPorOrden } from "@/lib/tecnicos/airtable";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { anularMovimientoDeAbono } from "@/lib/finanzas/puentes/abonos";
import { prepararAnulacionDeAbono } from "@/lib/saldo-favor/servidor";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Anula el abono (Estado del Abono = "Anulado") en vez de borrarlo, para
// conservar constancia. Se mantiene el verbo DELETE para no romper el cliente.
export async function DELETE(_: Request, { params }: Params) {
  const { response } = await requireTecnicosSession();
  if (response) return response;

  const { id } = await params;

  if (!id) {
    return NextResponse.json(
      { success: false, error: "Falta id del abono" },
      { status: 400 }
    );
  }

  try {
    // Auditoría ops, punto 13B: si el abono mueve el saldo a favor del
    // cliente, se revisa primero que se pueda deshacer y luego se anula
    // también su movimiento de saldo.
    const saldo = await prepararAnulacionDeAbono(id);
    if (saldo && !saldo.ok) {
      return NextResponse.json({ success: false, error: saldo.error }, { status: saldo.status });
    }
    const result = await anularAbonoPorOrden({ abonoRecordId: id });
    if (saldo?.ok) await saldo.despues();
    // Puente 20.2 (§1.5, Corrección 1) — anula también el movimiento
    // vinculado; si ya estaba facturado, la anulación procede igual pero
    // vuelve con un warning explícito en vez de bloquear.
    const { warning } = await anularMovimientoDeAbono(id);
    return NextResponse.json({ success: true, data: result.abono, warning });
  } catch (error) {
    console.error("Error al anular abono", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

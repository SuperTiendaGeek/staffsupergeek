import { NextResponse } from "next/server";
import { anularAbonoPorOrden } from "@/lib/tecnicos/airtable";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { anularMovimientoDeAbono } from "@/lib/finanzas/puentes/abonos";
import { prepararAnulacionDeAbono } from "@/lib/saldo-favor/servidor";
import { prepararAnulacionParteDePago } from "@/lib/parte-pago/servidor";
import { fetchRecordById } from "@/lib/finanzas/airtable-client";
import { esAbonoDeTraspaso } from "@/lib/cobros/metodos";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Anula el abono (Estado del Abono = "Anulado") en vez de borrarlo, para
// conservar constancia. Se mantiene el verbo DELETE para no romper el cliente.
export async function DELETE(_: Request, { params }: Params) {
  const { response, session } = await requireTecnicosSession();
  if (response || !session) return response ?? NextResponse.json({ success: false }, { status: 401 });

  const { id } = await params;

  if (!id) {
    return NextResponse.json(
      { success: false, error: "Falta id del abono" },
      { status: 400 }
    );
  }

  try {
    // Punto 10C-1: un traspaso orden → pedido aparte no se anula suelto (se
    // descuadrarían las dos cuentas a la vez).
    const actual = await fetchRecordById("Abonos", id);
    const obs = typeof actual?.fields["Observación"] === "string" ? (actual.fields["Observación"] as string) : "";
    const met = typeof actual?.fields["Método de Pago"] === "string" ? (actual.fields["Método de Pago"] as string) : "";
    if (actual && esAbonoDeTraspaso(met, obs)) {
      return NextResponse.json({ success: false, error: "Un traspaso a pedido aparte no se anula por separado. Avisa a un administrador." }, { status: 409 });
    }
    // Auditoría ops, punto 13B: si el abono mueve el saldo a favor del
    // cliente, se revisa primero que se pueda deshacer y luego se anula
    // también su movimiento de saldo.
    const saldo = await prepararAnulacionDeAbono(id);
    if (saldo && !saldo.ok) {
      return NextResponse.json({ success: false, error: saldo.error }, { status: saldo.status });
    }
    // Parte de pago (2-nov-2026): solo un administrador, y solo si el
    // artículo sigue libre en la tienda; después se da de baja.
    const parte = await prepararAnulacionParteDePago(id, session);
    if (parte && !parte.ok) {
      return NextResponse.json({ success: false, error: parte.error }, { status: parte.status });
    }
    const result = await anularAbonoPorOrden({ abonoRecordId: id });
    if (saldo?.ok) await saldo.despues();
    const avisoParte = parte?.ok ? await parte.despues() : null;
    // Puente 20.2 (§1.5, Corrección 1) — anula también el movimiento
    // vinculado; si ya estaba facturado, la anulación procede igual pero
    // vuelve con un warning explícito en vez de bloquear.
    const { warning } = await anularMovimientoDeAbono(id);
    return NextResponse.json({ success: true, data: result.abono, warning: [warning, avisoParte].filter(Boolean).join(" ") || null });
  } catch (error) {
    console.error("Error al anular abono", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

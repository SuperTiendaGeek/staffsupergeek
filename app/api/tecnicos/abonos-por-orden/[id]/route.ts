import { NextResponse } from "next/server";
import { anularAbonoPorOrden } from "@/lib/tecnicos/airtable";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";

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
    const result = await anularAbonoPorOrden({ abonoRecordId: id });
    return NextResponse.json({ success: true, data: result.abono });
  } catch (error) {
    console.error("Error al anular abono", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

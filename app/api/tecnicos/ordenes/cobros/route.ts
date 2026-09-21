import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { cargarOrdenesCobro } from "@/lib/tecnicos/cobros/airtable";
import { resumirCobros } from "@/lib/tecnicos/cobros/reglas";

export const dynamic = "force-dynamic";

// GET /api/tecnicos/ordenes/cobros?desde=YYYY-MM-DD
//     /api/tecnicos/ordenes/cobros?orden=recXXXXXXXXXXXXXX
//
// Control de cobros y documentos: cada orden clasificada (cargos, abonos,
// documento emitido) + el resumen por categoría del panel. Solo lectura.
// Con ?orden= devuelve una sola orden — la usa la tarjeta "Resumen
// financiero" para mostrar el documento con la MISMA regla del panel.
export async function GET(request: Request) {
  const { response } = await requireTecnicosSession();
  if (response) return response;

  const q = new URL(request.url).searchParams;
  try {
    const ordenes = await cargarOrdenesCobro({ desde: q.get("desde"), ordenId: q.get("orden") });
    return NextResponse.json({ success: true, data: { resumen: resumirCobros(ordenes), ordenes } });
  } catch (e) {
    console.error("[/api/tecnicos/ordenes/cobros GET]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "No se pudo calcular el control de cobros" },
      { status: 500 }
    );
  }
}

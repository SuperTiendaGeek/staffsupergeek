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
    // Airtable ocupado (429): el panel vuelve a intentar solo; no se muestra el error crudo.
    const ocupado = e instanceof Error && /\b429\b|RATE_LIMIT/.test(e.message);
    return NextResponse.json(
      ocupado
        ? { success: false, ocupado: true, error: "Airtable está ocupado. Se vuelve a intentar en unos segundos." }
        : { success: false, error: "No se pudo calcular el control de cobros." },
      { status: ocupado ? 503 : 500 }
    );
  }
}

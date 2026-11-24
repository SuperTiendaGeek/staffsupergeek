import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";
import { contarOrdenesEnEstado } from "@/lib/tecnicos/airtable";
import { compartirLectura } from "@/lib/compartir-lectura";

// Rediseño R8: cuántas órdenes hay en «Entregadas» y «Reciclaje» (bandejas de la Lista).
//   GET → { entregadas, reciclaje }
// Contar 500+ entregadas cuesta varias consultas: se guarda 5 minutos en esta
// instancia (un número de bandeja no necesita estar al segundo).

export const dynamic = "force-dynamic";

let memoria: { en: number; datos: { entregadas: number; reciclaje: number } } | null = null;

export async function GET() {
  const { response } = await requireTecnicosSession();
  if (response) return response;
  try {
    if (!memoria || Date.now() - memoria.en > 5 * 60_000) {
      const datos = await compartirLectura("ordenes-conteos", async () => {
        const [entregadas, reciclaje] = await Promise.all([
          contarOrdenesEnEstado("Finalizado Entregado"),
          contarOrdenesEnEstado("Enviado a Reciclaje"),
        ]);
        return { entregadas, reciclaje };
      });
      memoria = { en: Date.now(), datos };
    }
    return NextResponse.json({ success: true, data: memoria.datos }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[ordenes conteos]", e);
    return NextResponse.json({ success: false, error: "No se pudieron contar las órdenes." }, { status: 500 });
  }
}

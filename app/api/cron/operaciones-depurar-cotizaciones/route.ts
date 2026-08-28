import { NextResponse } from "next/server";
import { depurarCotizacionesEstancadas } from "@/lib/operaciones/depuracion";

export const dynamic = "force-dynamic";
// Tope alto por si el tablero crece; en Hobby de Vercel el límite real del
// plan gana igual, esto solo evita que Next lo corte antes de tiempo.
export const maxDuration = 60;

// Llamado por Vercel Cron (ver vercel.json). Vercel agrega automáticamente
// `Authorization: Bearer $CRON_SECRET` cuando esa variable de entorno existe
// en el proyecto — sin ella, la ruta rechaza cualquier llamada.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const authHeader = request.headers.get("authorization");

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const resultado = await depurarCotizacionesEstancadas();
    return NextResponse.json({ success: true, ...resultado });
  } catch (error) {
    console.error("[cron/operaciones-depurar-cotizaciones] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    );
  }
}

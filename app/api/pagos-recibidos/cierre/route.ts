import { NextResponse } from "next/server";
import { datosCierre, sesionBandeja } from "@/lib/pagos-en-linea/bandeja-servidor";
import { hoyEcuador } from "@/lib/pedidos-especiales/retiro";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Cierre del día (maqueta 12): cobrado − comisión = neto por pasarela. Solo Administradores.
const NO_CACHE = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const s = await sesionBandeja(true);
  if (!s.ok) return NextResponse.json({ success: false, error: s.error }, { status: s.status, headers: NO_CACHE });
  const f = new URL(request.url).searchParams.get("fecha") ?? "";
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : hoyEcuador();
  try {
    return NextResponse.json({ success: true, data: await datosCierre(fecha) }, { headers: NO_CACHE });
  } catch (e) {
    console.error("[pagos recibidos cierre]", e);
    return NextResponse.json({ success: false, error: "No se pudo calcular el cierre. Intenta de nuevo." }, { status: 500, headers: NO_CACHE });
  }
}

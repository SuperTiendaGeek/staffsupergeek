import { NextResponse } from "next/server";
import { datosBandeja, sesionBandeja } from "@/lib/pagos-en-linea/bandeja-servidor";
import type { Periodo } from "@/lib/pagos-en-linea/bandeja";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Bandeja "Pagos recibidos" (maqueta 12): tarjetas de arriba, pagos por
// asignar o revisar (con sugerencia) e historial del periodo.
const NO_CACHE = { "Cache-Control": "no-store" };
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const s = await sesionBandeja();
  if (!s.ok) return NextResponse.json({ success: false, error: s.error }, { status: s.status, headers: NO_CACHE });
  const u = new URL(request.url);
  const p = u.searchParams.get("periodo");
  const periodo: Periodo = p === "7dias" || p === "mes" ? p : "hoy";
  const desde = u.searchParams.get("desde") ?? "";
  const hasta = u.searchParams.get("hasta") ?? "";
  const conRango = FECHA.test(desde) && FECHA.test(hasta) && desde <= hasta;
  try {
    const data = await datosBandeja(conRango ? { desde, hasta } : { periodo });
    return NextResponse.json({ success: true, data: { ...data, admin: s.admin } }, { headers: NO_CACHE });
  } catch (e) {
    console.error("[pagos recibidos]", e);
    return NextResponse.json({ success: false, error: "No se pudo leer la bandeja. Intenta de nuevo." }, { status: 500, headers: NO_CACHE });
  }
}

import { NextResponse } from "next/server";
import { acreditarDia, sesionBandeja } from "@/lib/pagos-en-linea/bandeja-servidor";
import { PreGoLiveError } from "@/lib/finanzas/pre-go-live";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// "Acreditar el día en Finanzas" (maqueta 12): solo Administradores. Cada
// movimiento por acreditar de esa pasarela y ese día pasa a SGINGRESOS con su neto.
const NO_CACHE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const s = await sesionBandeja(true);
  if (!s.ok) return NextResponse.json({ success: false, error: s.error }, { status: s.status, headers: NO_CACHE });
  const b = (await request.json().catch(() => null)) as { fecha?: unknown; pasarela?: unknown } | null;
  const fecha = typeof b?.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.fecha) ? b.fecha : "";
  const pasarela = b?.pasarela === "DeUna" || b?.pasarela === "PayPhone" ? b.pasarela : null;
  if (!fecha || !pasarela) return NextResponse.json({ success: false, error: "Solicitud inválida." }, { status: 400, headers: NO_CACHE });
  try {
    const r = await acreditarDia(fecha, pasarela, s.usuario);
    return NextResponse.json({ success: true, data: r }, { headers: NO_CACHE });
  } catch (e) {
    if (e instanceof PreGoLiveError) return NextResponse.json({ success: false, error: e.message }, { status: 409, headers: NO_CACHE });
    console.error("[pagos recibidos acreditar día]", e);
    return NextResponse.json({ success: false, error: "No se pudo acreditar. Intenta de nuevo." }, { status: 500, headers: NO_CACHE });
  }
}

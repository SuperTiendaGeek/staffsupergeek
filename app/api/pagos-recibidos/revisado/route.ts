import { NextResponse } from "next/server";
import { sesionBandeja } from "@/lib/pagos-en-linea/bandeja-servidor";
import { marcarPagoRevisado } from "@/lib/pagos-en-linea/servidor";

export const dynamic = "force-dynamic";

// "Marcar revisado" (maqueta 12): un pago por revisar que ya tiene abono y se
// resolvió en su cuenta. Solo Administradores, con nota.
const NO_CACHE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const s = await sesionBandeja(true);
  if (!s.ok) return NextResponse.json({ success: false, error: s.error }, { status: s.status, headers: NO_CACHE });
  const b = (await request.json().catch(() => null)) as { codigo?: unknown; nota?: unknown } | null;
  const codigo = typeof b?.codigo === "string" ? b.codigo : "";
  const nota = typeof b?.nota === "string" ? b.nota : "";
  if (!/^PL-\d{6,}$/.test(codigo)) return NextResponse.json({ success: false, error: "Solicitud inválida." }, { status: 400, headers: NO_CACHE });
  try {
    const r = await marcarPagoRevisado({ codigo, nota, usuario: s.usuario });
    if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: r.status, headers: NO_CACHE });
    return NextResponse.json({ success: true, data: r }, { headers: NO_CACHE });
  } catch (e) {
    console.error("[pagos recibidos revisado]", e);
    return NextResponse.json({ success: false, error: "No se pudo guardar. Intenta de nuevo." }, { status: 500, headers: NO_CACHE });
  }
}

import { NextResponse } from "next/server";
import { sesionBandeja } from "@/lib/pagos-en-linea/bandeja-servidor";
import { asignarPagoRecibido } from "@/lib/pagos-en-linea/servidor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Asignar un pago "Por asignar" a una orden o un pedido (maquetas 12 y 12b).
// Registra el abono con el mismo motor (DeUna → cuenta DeUna por acreditar).
const NO_CACHE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const s = await sesionBandeja();
  if (!s.ok) return NextResponse.json({ success: false, error: s.error }, { status: s.status, headers: NO_CACHE });
  const b = (await request.json().catch(() => null)) as { codigo?: unknown; origen?: unknown; id?: unknown } | null;
  const codigo = typeof b?.codigo === "string" ? b.codigo : "";
  const id = typeof b?.id === "string" ? b.id : "";
  const origen = b?.origen === "Orden" || b?.origen === "Pedido" ? b.origen : null;
  if (!/^PL-\d{6,}$/.test(codigo) || !/^rec[A-Za-z0-9]{14}$/.test(id) || !origen) {
    return NextResponse.json({ success: false, error: "Solicitud inválida." }, { status: 400, headers: NO_CACHE });
  }
  try {
    const r = await asignarPagoRecibido({ codigo, destino: { origen, id }, usuario: s.usuario });
    if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: r.status, headers: NO_CACHE });
    return NextResponse.json({ success: true, data: r }, { headers: NO_CACHE });
  } catch (e) {
    console.error("[pagos recibidos asignar]", e);
    return NextResponse.json({ success: false, error: "No se pudo asignar. Revisa la bandeja e intenta de nuevo." }, { status: 500, headers: NO_CACHE });
  }
}

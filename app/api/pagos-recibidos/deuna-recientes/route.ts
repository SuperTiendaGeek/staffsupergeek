import { NextResponse } from "next/server";
import { deUnaRecientes, sesionBandeja } from "@/lib/pagos-en-linea/bandeja-servidor";

export const dynamic = "force-dynamic";

// Maqueta 12b: en "Registrar pago" con DeUna, los pagos DeUna recibidos en las
// últimas 2 horas que todavía no están asignados (el empleado elige el suyo).
const NO_CACHE = { "Cache-Control": "no-store" };

export async function GET() {
  const s = await sesionBandeja();
  if (!s.ok) return NextResponse.json({ success: false, error: s.error }, { status: s.status, headers: NO_CACHE });
  try {
    return NextResponse.json({ success: true, data: await deUnaRecientes() }, { headers: NO_CACHE });
  } catch (e) {
    console.error("[pagos recibidos DeUna recientes]", e);
    return NextResponse.json({ success: false, error: "No se pudo leer los pagos DeUna." }, { status: 500, headers: NO_CACHE });
  }
}

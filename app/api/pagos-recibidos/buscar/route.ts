import { NextResponse } from "next/server";
import { buscarCuentas, sesionBandeja } from "@/lib/pagos-en-linea/bandeja-servidor";
import { intentoPorCodigo } from "@/lib/pagos-en-linea/airtable";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Buscar a qué orden o pedido asignar un pago (maqueta 12, "Asignar").
// q: OR000552 · OP-2026-000151 · nombre · cédula. codigo: el pago (para ordenar por coincidencia).
const NO_CACHE = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const s = await sesionBandeja();
  if (!s.ok) return NextResponse.json({ success: false, error: s.error }, { status: s.status, headers: NO_CACHE });
  const u = new URL(request.url);
  const q = (u.searchParams.get("q") ?? "").slice(0, 60);
  const codigo = u.searchParams.get("codigo") ?? "";
  try {
    const pago = /^PL-\d{6,}$/.test(codigo) ? await intentoPorCodigo(codigo) : null;
    const data = await buscarCuentas(q, pago ? { monto: pago.monto, identificacion: pago.identificacion } : undefined);
    return NextResponse.json({ success: true, data }, { headers: NO_CACHE });
  } catch (e) {
    console.error("[pagos recibidos buscar]", e);
    return NextResponse.json({ success: false, error: "No se pudo buscar. Intenta de nuevo." }, { status: 500, headers: NO_CACHE });
  }
}

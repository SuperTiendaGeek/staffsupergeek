import { NextResponse } from "next/server";
import { vencerSaldos } from "@/lib/saldo-favor/servidor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Proceso diario (Vercel Cron, ver vercel.json) — auditoría ops, punto 13B-2.
// El saldo a favor que pasó 6 meses sin usarse queda "Vencido" y vuelve a
// ser venta en Finanzas (Ingreso "Crédito Caducado" sin cuenta). Incluye el
// crédito de las notas de crédito que ya están en el saldo del cliente.
// Vercel manda `Authorization: Bearer $CRON_SECRET`.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const vencidos = await vencerSaldos({ registradoPor: "Sistema (proceso diario)", aplicar: true });
    return NextResponse.json({ success: true, vencidos });
  } catch (error) {
    console.error("[cron/saldo-favor-vencido] Error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error desconocido" }, { status: 500 });
  }
}

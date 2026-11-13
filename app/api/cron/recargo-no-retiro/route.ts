import { NextResponse } from "next/server";
import { aplicarRecargos } from "@/lib/pedidos-especiales/retiro-servidor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Proceso diario (Vercel Cron, ver vercel.json) — auditoría ops, punto 10C-3b.
// A los 7 días de "¡Llegó a la tienda!", si el pedido no se retiró y el
// cliente aún debe algo, se suma UNA vez el recargo del 10 % de lo que debe.
// Vercel manda `Authorization: Bearer $CRON_SECRET`.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const recargos = await aplicarRecargos({ aplicar: true });
    return NextResponse.json({ success: true, recargos });
  } catch (error) {
    console.error("[cron/recargo-no-retiro] Error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error desconocido" }, { status: 500 });
  }
}

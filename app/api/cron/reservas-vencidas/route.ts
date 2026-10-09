import { NextResponse } from "next/server";
import { listarReservasActivas } from "@/lib/facturacion/reservas/airtable";
import { debeLiberarseSola, DIAS_GRACIA_VENCIDA } from "@/lib/facturacion/reservas/reglas";
import { liberarReserva } from "@/lib/facturacion/reservas/liberar";
import { ahoraEnEcuador } from "@/lib/facturacion/fechaEcuador";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Proceso diario (Vercel Cron, ver vercel.json) — auditoría Shipping V2,
// punto 6 (9-oct-2026). Libera solas las reservas que llevan
// DIAS_GRACIA_VENCIDA días vencidas sin que nadie las extienda ni las libere.
// Lo abonado queda como saldo a favor, igual que al liberar a mano.
// Vercel manda `Authorization: Bearer $CRON_SECRET`; sin esa variable la ruta
// rechaza cualquier llamada.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const hoy = ahoraEnEcuador();
    const activas = await listarReservasActivas();
    const liberadas: string[] = [];
    const errores: Array<{ numero: string; error: string }> = [];
    for (const r of activas) {
      if (!r.fechaLimite) continue;
      if (!debeLiberarseSola(new Date(`${r.fechaLimite.slice(0, 10)}T00:00:00`), hoy)) continue;
      try {
        await liberarReserva(r.recordId, {
          usuario: "Sistema (proceso diario)",
          motivo: `Liberada sola: venció el ${r.fechaLimite.slice(0, 10)} y pasaron ${DIAS_GRACIA_VENCIDA} días sin extenderla ni liberarla.`,
        });
        liberadas.push(r.numero);
      } catch (e) {
        errores.push({ numero: r.numero, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return NextResponse.json({ success: errores.length === 0, revisadas: activas.length, liberadas, errores });
  } catch (error) {
    console.error("[cron/reservas-vencidas] Error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error desconocido" }, { status: 500 });
  }
}

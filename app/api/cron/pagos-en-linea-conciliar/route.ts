import { NextResponse } from "next/server";
import { conciliarPagos } from "@/lib/pagos-en-linea/servidor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Revisión automática de pagos en línea (etapa D2, Codex punto 2): recupera
// pagos PayPhone/DeUna aprobados sin aplicar, o pagados aunque el cliente
// cerró la página y el aviso no llegó. Respeta QA y producción (cada cobro con
// su ambiente) y "un solo abono" (reserva en Blob).
// Lo llama Vercel Cron (vercel.json) o un programador externo, con
// `Authorization: Bearer $CRON_SECRET`; sin esa variable rechaza todo.
// Frecuencia: por ahora una vez al día (gratis en cualquier plan); el dueño
// decide si se sube a cada 5 minutos según su plan.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const resultado = await conciliarPagos(50);
    return NextResponse.json({ success: true, resultado });
  } catch (error) {
    console.error("[cron/pagos-en-linea-conciliar]", error instanceof Error ? error.message : "error");
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

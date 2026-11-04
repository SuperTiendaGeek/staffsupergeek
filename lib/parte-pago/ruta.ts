import "server-only";

import { NextResponse } from "next/server";
import type { StaffSession } from "@/lib/session";
import type { OrigenCuenta } from "@/lib/saldo-favor/servidor";
import { recibirParteDePago } from "./servidor";

/** POST de "Recibir parte de pago" (lo comparten la orden y el pedido; cada ruta pone su guardia). */
export async function responderParteDePago(request: Request, origen: OrigenCuenta, session: StaffSession): Promise<NextResponse> {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const r = await recibirParteDePago({
      origen,
      session,
      articulo: {
        descripcion: String(body.descripcion ?? ""),
        categoria: String(body.categoria ?? ""),
        condicion: String(body.condicion ?? ""),
        valor: Number(body.valor),
        numeroSerie: String(body.numeroSerie ?? ""),
      },
    });
    if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: r.status });
    return NextResponse.json({ success: true, data: { sku: r.sku, itemId: r.itemId, abonoId: r.abonoId, valor: r.valor }, warning: r.warning });
  } catch (e) {
    console.error("[parte-de-pago]", e);
    return NextResponse.json({ success: false, error: "Error inesperado. Revisa la cuenta antes de reintentar." }, { status: 500 });
  }
}

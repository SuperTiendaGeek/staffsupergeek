import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Fase 11 — Etapa 2: "Repuestos por Orden" queda congelado (solo lectura).
// La tarjeta de repuestos nueva escribe en Shipping Items; el historial legacy
// se muestra en la pestaña de solo lectura y nunca se vuelve a escribir.
export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error:
        "Esta acción quedó congelada (Fase 11). Los repuestos de la orden se agregan ahora desde Shipping Items.",
    },
    { status: 410 }
  );
}

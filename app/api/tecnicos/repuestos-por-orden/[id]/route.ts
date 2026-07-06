import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Fase 11 — Etapa 2: "Repuestos por Orden" queda congelado (solo lectura).
// El historial legacy nunca se borra ni se edita desde la UI.
export async function DELETE() {
  return NextResponse.json(
    {
      success: false,
      error: "Esta acción quedó congelada (Fase 11). El historial de repuestos legacy no se puede eliminar.",
    },
    { status: 410 }
  );
}

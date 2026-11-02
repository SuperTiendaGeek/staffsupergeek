import { NextResponse } from "next/server";
import { requireTecnicosSession } from "@/lib/tecnicos/api-auth";

export const dynamic = "force-dynamic";

// "Ya se pidió al proveedor" se retiró en la Fase 2 de la auditoría ops
// (2-nov-2026): creaba artículos sin orden de compra ni pago (caso OR000432).
// Ahora lo aprobado nace como solicitud de compra y Logística la compra en
// Shipping V2 → Por comprar → Registrar compra.
export async function POST() {
  const { response } = await requireTecnicosSession();
  if (response) return response;
  return NextResponse.json(
    { success: false, error: "Ya no se registra desde la orden: lo compra Logística en Shipping V2 → Por comprar." },
    { status: 410 }
  );
}

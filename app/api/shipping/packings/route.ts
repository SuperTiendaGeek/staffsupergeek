import { NextResponse } from "next/server";
import { canAccessApp } from "@/lib/apps";
import { crearShippingPackingRapido } from "@/lib/shipping/airtable";
import { getSessionFromCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getSessionFromCookie();

  if (!session) {
    return NextResponse.json({ success: false, error: "No autenticado" }, { status: 401 });
  }

  if (!canAccessApp(session, "Shipping")) {
    return NextResponse.json({ success: false, error: "Acceso denegado" }, { status: 403 });
  }

  try {
    const result = await crearShippingPackingRapido();
    return NextResponse.json({ success: true, data: result.packing, warning: result.warning }, { status: 201 });
  } catch (error) {
    console.error("Error al crear packing rápido de Shipping:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "No se pudo crear el packing." },
      { status: 500 }
    );
  }
}
